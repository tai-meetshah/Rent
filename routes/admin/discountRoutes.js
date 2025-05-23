const router = require('express').Router();
const authController = require('../../controllers/admin/authController');

const discountController = require('../../controllers/admin/discountController');

router.get(
    '/',
    authController.checkPermission('discount', 'isView'),
    discountController.getAllDiscount
);
router.get('/change-status/:id/:status', discountController.approvedDiscount);

module.exports = router;
