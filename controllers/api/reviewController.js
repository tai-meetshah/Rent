const multer = require('multer');
const mongoose = require('mongoose');
const Review = require('../../models/reviewModel');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const deleteFile = require('../../utils/deleteFile');
const userNotificationModel = require('../../models/userNotificationModel');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');

// Multer storage for images and video (saved under /public/uploads)
const storage = multer.diskStorage({
     destination: function (req, file, cb) {
          cb(null, './public/uploads/');
     },
     filename: function (req, file, cb) {
          cb(null, Date.now() + file.originalname.replaceAll(' ', ''));
     },
});

const allowedImage = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const allowedVideo = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-matroska', 'video/3gpp'];

const upload = multer({
     storage,
     limits: { fileSize: 1024 * 1024 * 200 }, // up to 200MB (mainly for video)
     fileFilter: (req, file, cb) => {
          if (allowedImage.includes(file.mimetype) || allowedVideo.includes(file.mimetype)) {
               cb(null, true);
          } else {
               cb(new Error('Unsupported file type.'), false);
          }
     },
});

// Middleware to handle multipart fields
exports.uploadReviewMedia = upload.fields([
     { name: 'images', maxCount: 6 },
     { name: 'video', maxCount: 1 },
]);

// Recompute product rating stats after create/update/delete review
async function recomputeProductRatings(productId) {
     const pid = new mongoose.Types.ObjectId(productId);
     const agg = await Review.aggregate([
          { $match: { product: pid } },
          {
               $group: {
                    _id: '$product',
                    avgRating: { $avg: '$rating' },
                    totalRating: { $sum: 1 },
               },
          },
     ]);

     const stats = agg[0] || { avgRating: 0, totalRating: 0 };
     const avg = Number(stats.avgRating || 0);
     await Product.findByIdAndUpdate(productId, {
          avgRating: Math.round(avg * 100) / 100,
          totalRating: stats.totalRating || 0,
     });
}

// POST /api/review
exports.createReview = async (req, res, next) => {
     try {
          const { bookingId, rating, review } = req.body;
          if (!bookingId || !rating || !review) {
               return res.status(400).json({ success: false, message: 'bookingId, rating and review are required.' });
          }

               const booking = await Booking.findById(bookingId)
                   .populate({
                       path: 'product',
                       populate: {
                           path: 'user',
                           select: 'name email fcmToken',
                       }, // vendor
                   })
                   .populate('user', 'name email');
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

          if (booking.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized for this booking.' });
          }

          // Only after booking completed
          // if (booking.status !== 'completed') {
          //      return res.status(400).json({ success: false, message: 'You can review only after booking is completed.' });
          // }

          // Prevent duplicate review per booking per user
          const existing = await Review.findOne({ booking: bookingId, user: req.user.id });
          if (existing) {
               return res.status(409).json({ success: false, message: 'Review for this booking already exists.' });
          }

          const images = (req.files?.images || []).map(f => `/${f.filename}`);
          const video = (req.files?.video && req.files.video[0]) ? `/${req.files.video[0].filename}` : undefined;

          const doc = await Review.create({
               user: req.user.id,
               // vendor: booking.product.user, // product owner as vendor
               product: booking.product._id,
               booking: booking._id,
               rating: Number(rating),
               review,
               images,
               video
          });

          await recomputeProductRatings(booking.product._id);

           if (booking.product?.user) {
               const vendor = booking.product.user;
               const title = `New review for ${booking.product.title}`;
               const body = `${
                   booking.user.name || 'A customer'
               } rated your product ${rating}★ and wrote: "${review}"`;

               // Send push notification
               if (vendor.fcmToken) {
                   await sendNotificationsToTokens(title, body, [
                       vendor.fcmToken,
                   ]);
               }

               // Save notification in DB
               await userNotificationModel.create({
                   sentTo: [vendor._id],
                   title,
                   body,
               });
           }
          res.status(201).json({ success: true, data: doc });
     } catch (error) {
          next(error);
     }
};

// PUT /api/review/:id
exports.updateReview = async (req, res, next) => {
     try {
          const { id } = req.params;

               const reviewDoc = await Review.findById(id)
                   .populate({
                       path: 'product',
                       populate: {
                           path: 'user',
                           select: 'name email fcmToken',
                       },
                   })
                   .populate('user', 'name email');
          if (!reviewDoc) return res.status(404).json({ success: false, message: 'Review not found.' });
          if (reviewDoc.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized.' });
          }

          const update = {};
          if (req.body.rating !== undefined) update.rating = Number(req.body.rating);
          if (req.body.review !== undefined) update.review = req.body.review;

          if (req.files) {
               const newImages = (req.files.images || []).map(f => `/${f.filename}`);
               const newVideo = (req.files.video && req.files.video[0]) ? `/${req.files.video[0].filename}` : undefined;

               if (newImages.length > 0) {
                    const currentImages = Array.isArray(reviewDoc.images) ? reviewDoc.images : [];
                    const combined = currentImages.concat(newImages);
                    if (combined.length > 6) {
                         return res.status(400).json({ success: false, message: 'You can have at most 6 images per review.' });
                    }
                    update.images = combined;
               }
               if (newVideo !== undefined) update.video = newVideo;
          }

          const updated = await Review.findByIdAndUpdate(id, update, { new: true });
          await recomputeProductRatings(reviewDoc.product);

          if (reviewDoc.product?.user) {
              const vendor = reviewDoc.product.user;
              const title = `Review updated for ${reviewDoc.product.title}`;
              const body = `${
                  reviewDoc.user.name || 'A customer'
              } has updated their review. New rating: ${
                  update.rating ?? reviewDoc.rating
              }★`;

              if (vendor.fcmToken) {
                  await sendNotificationsToTokens(title, body, [
                      vendor.fcmToken,
                  ]);
              }

              await userNotificationModel.create({
                  sentTo: [vendor._id],
                  title,
                  body,
              });
          }
          res.json({ success: true, data: updated });
     } catch (error) {
          next(error);
     }
};

// DELETE /api/review/:id/image?file=/123.jpg OR ?idx=0
exports.deleteReviewImage = async (req, res, next) => {
     try {
          const { id } = req.params;
          const { file, idx } = req.query;

          const reviewDoc = await Review.findById(id);
          if (!reviewDoc) return res.status(404).json({ success: false, message: 'Review not found.' });
          if (reviewDoc.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized.' });
          }

          if ((!file || file === 'undefined') && (idx === undefined || idx === '')) {
               return res.status(400).json({ success: false, message: 'Provide image file path (?file=) or index (?idx=).' });
          }

          let removed;
          if (file && file !== 'undefined') {
               const position = reviewDoc.images.findIndex(p => p === file);
               if (position === -1) return res.status(404).json({ success: false, message: 'Image not found on review.' });
               removed = reviewDoc.images.splice(position, 1)[0];
          } else {
               const position = Number(idx);
               if (Number.isNaN(position) || position < 0 || position >= reviewDoc.images.length) {
                    return res.status(400).json({ success: false, message: 'Invalid image index.' });
               }
               removed = reviewDoc.images.splice(position, 1)[0];
          }

          await reviewDoc.save();
          if (removed) deleteFile(removed);

          res.json({ success: true, message: 'Image removed from review.' });
     } catch (error) {
          next(error);
     }
};

// DELETE /api/review/:id/video
exports.deleteReviewVideo = async (req, res, next) => {
     try {
          const { id } = req.params;

          const reviewDoc = await Review.findById(id);
          if (!reviewDoc) return res.status(404).json({ success: false, message: 'Review not found.' });
          if (reviewDoc.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized.' });
          }

          if (!reviewDoc.video) return res.status(404).json({ success: false, message: 'No video to delete.' });

          const toDelete = reviewDoc.video;
          reviewDoc.video = undefined;
          await reviewDoc.save();
          deleteFile(toDelete);

          res.json({ success: true, message: 'Video removed from review.' });
     } catch (error) {
          next(error);
     }
};

// DELETE /api/review/:id
exports.deleteReview = async (req, res, next) => {
     try {
          const { id } = req.params;

          const reviewDoc = await Review.findById(id);
          if (!reviewDoc) return res.status(404).json({ success: false, message: 'Review not found.' });
          if (reviewDoc.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized.' });
          }

          await Review.findByIdAndDelete(id);
          await recomputeProductRatings(reviewDoc.product);

          res.json({ success: true, message: 'Review deleted.' });
     } catch (error) {
          next(error);
     }
};

// GET /api/review/product/:productId
exports.getProductReviews = async (req, res, next) => {
     try {
          const { productId } = req.params;
          const reviews = await Review.find({ product: productId })
               .sort('-createdAt')
               .populate('user', 'name avatar image email')
               .select('-__v');
        const validReviews = reviews.filter(r => r.user !== null);

          res.json({ success: true, data: validReviews });
     } catch (error) {
          next(error);
     }
};

// GET /api/review/my?productId=...
exports.getMyReview = async (req, res, next) => {
     try {
          const { productId } = req.query;
          const filter = { user: req.user.id };
          if (productId) filter.product = productId;

          const review = await Review.find(filter).populate({
               path: 'product',
               match: { isDeleted: false, isActive: true },
               populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' }
               ]
          }).populate({
               path: 'user',
               select: 'name avatar image email'
          }).sort('-createdAt');
          res.json({ success: true, data: review });
     } catch (error) {
          next(error);
     }
};

// GET /api/review/received - Get all reviews received by the current user as a vendor
exports.getReceivedReviews = async (req, res, next) => {
     try {
          // Find all products owned by the current user
          const userProducts = await Product.find({
               user: req.user.id,
               isDeleted: false,
               isActive: true
          }).select('_id');

          const productIds = userProducts.map(product => product._id);

          const reviews = await Review.find({ product: { $in: productIds } })
               .sort('-createdAt')
               .populate({
                    path: 'user',
                    select: 'name avatar image email'
               })
               .populate({
                    path: 'product',
                    select: 'title images user',
                    match: { isDeleted: false, isActive: true },
                    populate: [
                         { path: 'category', select: 'name' },
                         { path: 'subcategory', select: 'name' }
                    ]
               })
               .populate('booking', 'status startDate endDate')
               .select('-__v');

     const validReviews = reviews.filter(
         r => r.user !== null && r.product !== null
     );
          res.json({
              success: true,
              data: validReviews,
          });
     } catch (error) {
          next(error);
     }
};