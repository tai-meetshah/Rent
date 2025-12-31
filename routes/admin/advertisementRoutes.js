// routes/admin/advertisementRoutes.js
const router = require('express').Router();
const fileUpload = require('express-fileupload');
const { checkAdmin } = require('../../controllers/admin/authController');
const advertisementController = require('../../controllers/admin/advertisementController');

// Get all advertisements
router.get('/', checkAdmin, advertisementController.getAllAdvertisements);

// Approve advertisement
router.post(
    '/approve',
    fileUpload(),
    checkAdmin,
    advertisementController.approveAdvertisement
);

// Reject advertisement
router.post(
    '/reject',
    fileUpload(),
    checkAdmin,
    advertisementController.rejectAdvertisement
);

// Get advertisement statistics
router.get(
    '/statistics',
    checkAdmin,
    advertisementController.getAdvertisementStatistics
);

// Update advertisement pricing
router.post(
    '/update-pricing',
    fileUpload(),
    checkAdmin,
    advertisementController.updateAdvertisementPricing
);

module.exports = router;
