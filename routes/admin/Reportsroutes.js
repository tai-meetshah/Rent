const router = require('express').Router();
const authController = require('../../controllers/admin/authController');
const reportsController = require('../../controllers/admin/Reportscontroller');

// Reports dashboard
router.get(
    '/',
    authController.checkPermission('reports', 'isView'),
    reportsController.getReports
);

// Transactions list
router.get(
    '/transactions',
    authController.checkPermission('reports', 'isView'),
    reportsController.getTransactions
);

// Transaction detail
router.get(
    '/transactions/:id',
    authController.checkPermission('reports', 'isView'),
    reportsController.getTransactionDetail
);

// Export reports
router.get(
    '/export',
    authController.checkPermission('reports', 'isView'),
    reportsController.exportReports
);

// User activity analytics
router.get(
    '/user-activity',
    authController.checkPermission('reports', 'isView'),
    reportsController.getUserActivity
);

module.exports = router;
