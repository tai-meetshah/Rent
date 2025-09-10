const multer = require('multer');
const mongoose = require('mongoose');
const Review = require('../../models/reviewModel');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');

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

          const booking = await Booking.findById(bookingId).populate('product');
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

          // Ensure the booking belongs to the current user
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
               vendor: booking.product.user, // product owner as vendor
               product: booking.product._id,
               booking: booking._id,
               rating: Number(rating),
               review,
               images,
               video
          });

          await recomputeProductRatings(booking.product._id);

          res.status(201).json({ success: true, data: doc });
     } catch (error) {
          next(error);
     }
};

// PUT /api/review/:id
exports.updateReview = async (req, res, next) => {
     try {
          const { id } = req.params;

          const reviewDoc = await Review.findById(id);
          if (!reviewDoc) return res.status(404).json({ success: false, message: 'Review not found.' });
          if (reviewDoc.user.toString() !== req.user.id.toString()) {
               return res.status(403).json({ success: false, message: 'Not authorized.' });
          }

          const update = {};
          if (req.body.rating !== undefined) update.rating = Number(req.body.rating);
          if (req.body.review !== undefined) update.review = req.body.review;

          // If files provided, replace media (simple overwrite strategy)
          if (req.files) {
               const newImages = (req.files.images || []).map(f => `/${f.filename}`);
               const newVideo = (req.files.video && req.files.video[0]) ? `/${req.files.video[0].filename}` : undefined;

               if (newImages.length > 0) update.images = newImages;
               if (newVideo !== undefined) update.video = newVideo;
          }

          const updated = await Review.findByIdAndUpdate(id, update, { new: true });
          await recomputeProductRatings(reviewDoc.product);

          res.json({ success: true, data: updated });
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

          res.json({ success: true, data: reviews });
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

          const review = await Review.findOne(filter).populate({
               path: 'product',
               match: { isDeleted: false, isActive: true },
               populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' }
               ]
          }).sort('-createdAt');
          res.json({ success: true, data: review });
     } catch (error) {
          next(error);
     }
};
