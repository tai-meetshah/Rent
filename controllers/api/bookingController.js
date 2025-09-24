const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const Review = require('../../models/reviewModel');
const enquiryModel = require('../../models/enquiryModel');

// Helpers
async function hasOverlappingBooking(productId, dates) {
     const justDates = (dates || []).map(d => new Date(d.date || d));
     if (!justDates.length) return false;
     const overlap = await Booking.findOne({
          product: productId,
          status: { $nin: ['cancelled', 'completed'] },
          "bookedDates.date": { $in: justDates }
     }).select('_id');
     return Boolean(overlap);
}

exports.checkAvailability = async (req, res, next) => {
     try {
          const { productId, dates } = req.body;
          if (!productId || !Array.isArray(dates)) {
               return res.status(400).json({ success: false, message: 'productId and dates[] are required' });
          }
          const product = await Product.findById(productId).select('_id selectDate allDaysAvailable');
          if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

          // Check if requested dates are available in product's selectDate
          let datesAvailable = true;
          if (!product.allDaysAvailable && product.selectDate && product.selectDate.length > 0) {
               const requestedDates = dates.map(d => new Date(d.date || d));
               const availableDates = product.selectDate.map(date => new Date(date));

               // Check if all requested dates are in the available dates
               datesAvailable = requestedDates.every(requestedDate =>
                    availableDates.some(availableDate =>
                         requestedDate.toDateString() === availableDate.toDateString()
                    )
               );
          }

          if (!datesAvailable) {
               return res.json({ success: true, available: false, reason: 'Selected dates are not available for this product' });
          }

          const isOverlap = await hasOverlappingBooking(productId, dates);
          return res.json({ success: true, available: !isOverlap });
     } catch (error) {
          next(error);
     }
};

exports.createBooking = async (req, res, next) => {
     try {
          const { productId, deliveryType, pickupTime, advancePayment, totalPrice, notes } = req.body;
          let { bookedDates, address } = req.body;
          // Accept bookedDates as JSON string or array
          if (typeof bookedDates === 'string') {
               try { bookedDates = JSON.parse(bookedDates); } catch (_) { }
          }
          if (!productId || !Array.isArray(bookedDates) || !deliveryType) {
               return res.status(400).json({ success: false, message: 'Required: productId, bookedDates[], deliveryType' });
          }

          if (typeof address === 'string') {
               try { address = JSON.parse(address); } catch (_) { }
          }
          // if (!address || typeof address !== 'object') {
          //      address = {
          //           fullName: req.body.fullName,
          //           mobileNumber: req.body.mobileNumber,
          //           addressLine: req.body.addressLine,
          //           city: req.body.city,
          //           state: req.body.state,
          //           pincode: req.body.pincode,
          //           country: req.body.country,
          //      };
          // }

          const product = await Product.findById(productId);
          if (!product) return res.status(404).json({ success: false, message: 'Product not found.' });

          // Check if requested dates are available in product's selectDate
          if (!product.allDaysAvailable && product.selectDate && product.selectDate.length > 0) {
               const requestedDates = bookedDates.map(d => new Date(d.date || d));
               const availableDates = product.selectDate.map(date => new Date(date));

               // Check if all requested dates are in the available dates
               const allDatesAvailable = requestedDates.every(requestedDate =>
                    availableDates.some(availableDate =>
                         requestedDate.toDateString() === availableDate.toDateString()
                    )
               );

               if (!allDatesAvailable) {
                    return res.status(400).json({
                         success: false,
                         message: 'Some selected dates are not available for this product.'
                    });
               }
          }

          const overlap = await hasOverlappingBooking(productId, bookedDates);
          if (overlap) return res.status(409).json({ success: false, message: 'Selected dates are not available.' });

          const verificationImagePath = req.file ? `/${req.file.filename}` : undefined;

          await Booking.create({
               product: productId,
               user: req.user.id,
               bookedDates,
               deliveryType,
               pickupTime,
               advancePayment: Number(advancePayment) || 0,
               // totalPrice: Number(totalPrice),
               status: 'pending',
               paymentStatus: 'unpaid',
               returnPhotos: [],
               verificationId: verificationImagePath,
               notes,
               address,
          });

          res.status(201).json({ success: true, message: 'Booking created successfully.' });
     } catch (error) {
          console.log(error);

          next(error);
     }
};

// {"fullName":"John Doe","mobileNumber":"1234567890","addressLine":"123 Street","city":"City","state":"State","pincode":"123456","country":"Country"}
exports.getMyBookings = async (req, res, next) => {
     try {
          const bookings = await Booking.find({ user: req.user.id, status: 'pending', })
               .sort('-createdAt')
               .populate({
                    path: 'product',
                    // match: { isDeleted: false, isActive: true },
                    populate: [
                         { path: 'category', select: 'name' },
                         { path: 'subcategory', select: 'name' }
                    ]
               })
          const filteredBookings = bookings.filter(booking => booking.product && booking.product.isActive && !booking.product.isDeleted);

          res.json({ success: true, data: filteredBookings });
     } catch (error) {
          next(error);
     }
};


exports.getSellerBookings = async (req, res, next) => {
     try {
          const sellerId = req.user.id; // Assumes auth middleware sets req.user

          const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

          const productIds = await Product.find({
               user: sellerObjectId,
               isDeleted: false,
               isActive: true,
          }).distinct('_id');

          const bookings = await Booking.find({
               status: 'pending',
               product: { $in: productIds },
          })
               .populate([
                    {
                         path: 'product', populate: [
                              { path: 'category', select: 'name' },
                              { path: 'subcategory', select: 'name' },
                         ]
                    },
               ])
               .sort({ createdAt: -1 });

          // const filteredBookings = bookings.filter(b => b.product !== null);

          res.json({
               success: true,
               data: bookings
          });
     } catch (error) {
          next(error);
     }
};

exports.getBookingById = async (req, res, next) => {
     try {
          const { id } = req.params;
          const booking = await Booking.findOne({ _id: id, user: req.user.id })
               .populate('product', '-__v -isDeleted');
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
          res.json({ success: true, data: booking });
     } catch (error) {
          next(error);
     }
};

exports.cancelBooking = async (req, res, next) => {
     try {
          const { bookingId } = req.body;
          const booking = await Booking.findOne({ _id: bookingId, user: req.user.id });
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
          booking.status = 'cancelled';
          await booking.save();
          res.json({ success: true, message: 'Booking cancelled.' });
     } catch (error) {
          next(error);
     }
};

// Only seller can update booking status
exports.updateStatus = async (req, res, next) => {
     try {
          const { bookingId, status } = req.body;
          const allowed = ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'];

          if (!allowed.includes(status)) {
               return res.status(400).json({ success: false, message: 'Invalid status' });
          }

          const booking = await Booking.findOne({ _id: bookingId }).populate('product');
          if (!booking) {
               return res.status(404).json({ success: false, message: 'Booking not found.' });
          }

          const isSeller = booking.product?.user?.toString() === req.user.id.toString();
          if (!isSeller) {
               return res.status(403).json({ success: false, message: 'Unauthorized: Only seller can update status.' });
          }

          // Update and save status
          booking.status = status;
          await booking.save();

          res.json({ success: true, message: 'Status updated.', booking });
     } catch (error) {
          next(error);
     }
};


exports.updatePaymentStatus = async (req, res, next) => {
     try {
          const { bookingId, paymentStatus } = req.body;
          const allowed = ['unpaid', 'paid', 'refunded'];
          if (!allowed.includes(paymentStatus)) return res.status(400).json({ success: false, message: 'Invalid paymentStatus' });
          const booking = await Booking.findOne({ _id: bookingId, user: req.user.id });
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
          booking.paymentStatus = paymentStatus;
          await booking.save();
          res.json({ success: true, message: 'Payment status updated.' });
     } catch (error) {
          next(error);
     }
};

exports.uploadReturnPhotos = async (req, res, next) => {
     try {
          const { id } = req.params; // bookingId
          const booking = await Booking.findOne({ _id: id, user: req.user.id });
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
          const files = req.files || [];
          const photos = files.map(f => ({ url: `/${f.filename}`, status: 'pending', uploadedAt: new Date() }));
          booking.returnPhotos.push(...photos);
          await booking.save();
          res.status(201).json({ success: true, message: 'Photos uploaded.', photos: booking.returnPhotos });
     } catch (error) {
          next(error);
     }
};

exports.reviewReturnPhoto = async (req, res, next) => {
     try {
          const { bookingId, photoId, action, rejectionReason } = req.body;
          const booking = await Booking.findOne({ _id: bookingId, user: req.user.id });
          if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
          const photo = (booking.returnPhotos || []).id(photoId);
          if (!photo) return res.status(404).json({ success: false, message: 'Photo not found.' });
          if (action === 'approve') {
               photo.status = 'approved';
               photo.rejectionReason = undefined;
          } else if (action === 'reject') {
               photo.status = 'rejected';
               photo.rejectionReason = rejectionReason || 'Not approved';
          } else {
               return res.status(400).json({ success: false, message: 'Invalid action' });
          }

          const allPhotos = booking.returnPhotos || [];
          const allApproved = allPhotos.length > 0 && allPhotos.every(p => p.status === 'approved');

          if (allApproved) {
               booking.allReturnPhotosVerify = true;
          } else {
               booking.allReturnPhotosVerify = false;
          }

          await booking.save();
          res.json({ success: true, message: 'Photo reviewed.' });
     } catch (error) {
          next(error);
     }
};

exports.reuploadRejectedPhoto = async (req, res, next) => {
     try {
          const { id } = req.params; // bookingId
          const { photoId } = req.body; // ID of the rejected photo to replace

          if (!photoId) {
               return res.status(400).json({ success: false, message: 'Photo ID is required.' });
          }

          const booking = await Booking.findOne({ _id: id, user: req.user.id });
          if (!booking) {
               return res.status(404).json({ success: false, message: 'Booking not found.' });
          }

          const photo = (booking.returnPhotos || []).id(photoId);
          if (!photo) {
               return res.status(404).json({ success: false, message: 'Photo not found.' });
          }

          if (photo.status !== 'rejected') {
               return res.status(400).json({
                    success: false,
                    message: 'Only rejected photos can be re-uploaded.'
               });
          }

          if (!req.file) {
               return res.status(400).json({ success: false, message: 'New photo file is required.' });
          }

          photo.url = `/${req.file.filename}`;
          photo.status = 'pending';
          photo.rejectionReason = undefined;
          photo.uploadedAt = new Date();

          // Since photo is now pending, set allReturnPhotosVerify to false
          booking.allReturnPhotosVerify = false;

          await booking.save();

          res.json({
               success: true,
               message: 'Photo re-uploaded successfully.',
               photo: photo
          });
     } catch (error) {
          next(error);
     }
};

// Active orders: status confirmed and has at least one return photo
exports.getActiveOrders = async (req, res, next) => {
     try {
          const bookings = await Booking.find({
               user: req.user.id,
               status: 'confirmed',
               // "returnPhotos.0": { $exists: true }
          })
               .sort('-createdAt')
               .populate({
                    path: 'product',
                    populate: [
                         { path: 'category', select: 'name' },
                         { path: 'subcategory', select: 'name' }
                    ]
               });

          const filtered = bookings.filter(b => b.product && b.product.isActive && !b.product.isDeleted);
          res.json({ success: true, data: filtered });
     } catch (error) {
          next(error);
     }
};

// Active orders for seller: status confirmed orders for seller's products
exports.getSellerActiveOrders = async (req, res, next) => {
     try {
          const sellerId = req.user.id;
          const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

          const productIds = await Product.find({
               user: sellerObjectId,
               isDeleted: false,
               isActive: true,
          }).distinct('_id');

          const bookings = await Booking.find({
               product: { $in: productIds },
               status: 'confirmed',
               // "returnPhotos.0": { $exists: true }
          })
               .sort('-createdAt')
               .populate([
                    {
                         path: 'product',
                         populate: [
                              { path: 'category', select: 'name' },
                              { path: 'subcategory', select: 'name' },
                         ]
                    },
                    { path: 'user', select: 'name email image avatar' }
               ]);

          const filtered = bookings.filter(b => b.product && b.product.isActive && !b.product.isDeleted);
          res.json({ success: true, data: filtered });
     } catch (error) {
          next(error);
     }
};

// Order history: shows when any return photo is accepted (approved) used for renter who take product for rent for some days
exports.getOrderHistory = async (req, res, next) => {
     try {
          const bookings = await Booking.find({
               user: req.user.id,
               "returnPhotos.status": 'approved'
          })
               .sort('-createdAt')
               .populate({
                    path: 'product',
                    populate: [
                         { path: 'category', select: 'name' },
                         { path: 'subcategory', select: 'name' }
                    ]
               });

          const filtered = bookings.filter(b => b.product && b.product.isActive && !b.product.isDeleted);

          const bookingIds = filtered.map(b => b._id);
          const reviews = await Review.find({ user: req.user.id, booking: { $in: bookingIds } }).select('booking');
          const reviewedSet = new Set(reviews.map(r => r.booking.toString()));

          const data = filtered.map(b => ({
               ...b.toObject(),
               hasReview: reviewedSet.has(b._id.toString())
          }));
          res.json({ success: true, data: data });
     } catch (error) {
          next(error);
     }
};

exports.getSellerOrderHistory = async (req, res, next) => {
     try {
          const sellerId = req.user.id;
          const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

          const productIds = await Product.find({
               user: sellerObjectId,
               isDeleted: false,
               isActive: true,
          }).distinct('_id');

          const bookings = await Booking.find({
               product: { $in: productIds },
               "returnPhotos.status": 'approved'
          })
               .sort('-createdAt')
               .populate([
                    {
                         path: 'product',
                         populate: [
                              { path: 'category', select: 'name' },
                              { path: 'subcategory', select: 'name' },
                         ]
                    },
                    { path: 'user', select: 'name email image avatar' }
               ]);

          const filtered = bookings.filter(b => b.product && b.product.isActive && !b.product.isDeleted);

          const bookingIds = filtered.map(b => b._id);
          const reviews = await Review.find({ booking: { $in: bookingIds } }).select('booking');
          const reviewedSet = new Set(reviews.map(r => r.booking.toString()));

          const data = filtered.map(b => ({
               ...b.toObject(),
               hasReview: reviewedSet.has(b._id.toString())
          }));

          res.json({ success: true, data });
     } catch (error) {
          next(error);
     }
};

exports.sendEnquiry = async (req, res, next) => {
     try {
          if (!req.body.enquiry)
               return res.status(400).json({
                    success: false,
                    message: 'Please enter enquiry.',
               });

          var _c = {
               sender: 'U',
               subject: req.body.subject,
               msg: req.body.enquiry,
          };
          await enquiryModel.create({
               user: req.user.id,
               chat: _c,
          });

          res.status(201).json({
               success: true,
               message: 'Enquiry send successfully',
          });
     } catch (error) {
          console.log(error);
          next(error);
     }
};

exports.sendMsg = async (req, res, next) => {
     try {
          const enquiry = await enquiryModel.findById(req.params.id)
          if (!enquiry.isEnded) {

               // var validFile = ['application/pdf', 'application/msword', 'application/vnd.ms-excel']
               // if (req.file) {
               //      var fileType = validFile.includes(req.file.mimetype) ? 'file' : 'img';
               // }
               enquiry.chat.push(
                    {
                         msg: req.body.msg,
                         sender: "U",
                         // type: req.file ? fileType : 'text'
                    }
               )

               await enquiry.save();

               res.status(201).json({
                    success: true,
                    message: 'success'
               });
          }
          else {
               res.status(201).json({
                    success: true,
                    message: 'Oops! chat was ended by the Admin.'
               });
          }
     } catch (error) {
          console.log(error)
          next(error);
     }
};

exports.enquiryList = async (req, res) => {
     try {
          const data = await enquiryModel.find({ user: req.user.id }).sort({ updatedAt: -1 });

          res.status(201).json({
               success: true,
               // message: req.t('chat_ended'),
               data: data
          });

     } catch (error) {
          console.log(error)
          next(error);
     }
};

exports.chatHistory = async (req, res, next) => {
     try {

          const enquiry = await enquiryModel.findById(req.params.id)

          await enquiryModel.updateOne(
               { _id: req.params.id },
               { $set: { "chat.$[elem].isRead": true } },
               { arrayFilters: [{ "elem.sender": "A" }] }
          );

          res.status(201).json({
               success: true,
               data: enquiry
          });
     } catch (error) {
          console.log(error)
          next(error);
     }
};