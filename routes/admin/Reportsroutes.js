const router = require('express').Router();
const authController = require('../../controllers/admin/authController');
const reportsController = require('../../controllers/admin/Reportscontroller');

// Reports dashboard
router.get(
    '/',
    reportsController.getReports
);

// Transactions list
router.get(
    '/transactions',
    reportsController.getTransactions
);

// Transaction detail
router.get(
    '/transactions/:id',
    reportsController.getTransactionDetail
);

// Export reports
router.get(
    '/export',
    reportsController.exportReports
);

// User activity analytics
router.get(
    '/user-activity',
    reportsController.getUserActivity
);

module.exports = router;
