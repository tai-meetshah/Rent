// routes/api/advertisementRoutes.js
const router = require('express').Router();
const { upload } = require('../../controllers/uploadController');
const { checkUser } = require('../../controllers/api/authController');
const advertisementController = require('../../controllers/api/advertisementController');
const fileUpload = require('express-fileupload');

// Get advertisement pricing
router.get(
    '/pricing',
    advertisementController.getAdvertisementPricing
);

// Create advertisement payment
router.post(
    '/create-payment',
    upload.single('image'),
    checkUser,
    advertisementController.createAdvertisementPayment
);

// Confirm advertisement payment
router.post(
    '/confirm-payment',
    fileUpload(),
    checkUser,
    advertisementController.confirmAdvertisementPayment
);

// Get my advertisements
router.get(
    '/my-advertisements',
    checkUser,
    advertisementController.getMyAdvertisements
);

// Get active advertisements (public)
router.get(
    '/active',
    checkUser,
    advertisementController.getActiveAdvertisements
);

// Cancel advertisement
router.post(
    '/cancel',
    fileUpload(),
    checkUser,
    advertisementController.cancelAdvertisement
);

// Get advertisement analytics
router.get(
    '/analytics/:advertisementId',
    checkUser,
    advertisementController.getAdvertisementAnalytics
);

module.exports = router;
