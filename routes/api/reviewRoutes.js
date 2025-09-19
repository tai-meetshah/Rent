const router = require('express').Router();
const fileUpload = require('express-fileupload');
const { checkUser } = require('../../controllers/api/authController');
const reviewController = require('../../controllers/api/reviewController');

// Create review with media
router.post(
     '/',
     checkUser,
     reviewController.uploadReviewMedia,
     reviewController.createReview
);

// Update review (replace text/rating and optionally media)
router.put(
     '/:id',
     checkUser,
     reviewController.uploadReviewMedia,
     reviewController.updateReview
);

// Delete review
router.delete('/:id', checkUser, reviewController.deleteReview);

// List reviews for a product
router.get('/product/:productId', checkUser, reviewController.getProductReviews);

// Get my latest review (optionally filter by productId)
router.get('/my', checkUser, fileUpload(), reviewController.getMyReview);

// Get all reviews received by the current user as a vendor
router.get('/received', checkUser, reviewController.getReceivedReviews);

module.exports = router;
