const router = require('express').Router();
const fileUpload = require('express-fileupload');
const { upload } = require('../../controllers/uploadController');
const { checkUser } = require('../../controllers/api/authController');

const bookingController = require('../../controllers/api/bookingController');

router.post('/check-availability', fileUpload(), checkUser, bookingController.checkAvailability);
// Accept image for verificationId using multer single upload
router.post('/my-bookings', upload.single('verificationId'), checkUser, bookingController.createBooking);
router.get('/my-bookings', checkUser, bookingController.getMyBookings);
router.get('/my-bookings/:id', checkUser, bookingController.getBookingById);
router.post('/cancel', fileUpload(), checkUser, bookingController.cancelBooking);

router.get('/seller-bookings', checkUser, bookingController.getSellerBookings);
router.post('/status', fileUpload(), checkUser, bookingController.updateStatus); //By seller
router.post('/payment-status', fileUpload(), checkUser, bookingController.updatePaymentStatus);

router.post('/:id/return-photos', upload.array('photos', 6), checkUser, bookingController.uploadReturnPhotos);
router.post('/review-photo', fileUpload(), checkUser, bookingController.reviewReturnPhoto);
router.post('/:id/reupload-photo', upload.single('photo'), checkUser, bookingController.reuploadRejectedPhoto);

router.get('/active-orders', checkUser, bookingController.getActiveOrders);
router.get('/order-history', checkUser, bookingController.getOrderHistory);

router.post('/sendEnquiry', checkUser, upload.single('image'), bookingController.sendEnquiry);

module.exports = router;
