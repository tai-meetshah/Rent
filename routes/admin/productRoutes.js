const router = require('express').Router();
const multer = require('multer');
const authController = require('../../controllers/admin/authController');

const categoryController = require('../../controllers/admin/categoryController');
const productApprovalController = require('../../controllers/admin/productApprovalController');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/uploads/');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + file.originalname.replaceAll(' ', ''));
    },
});

// Initialize multer with storage engine
const upload = multer({ storage: storage });

router.get(
    '/product',
    categoryController.getProducts
);
router.get(
    '/product/product_view/:id',
    categoryController.getProductView
);
router.get('/product/delete-product/:id', categoryController.deleteProduct);
router.get(
    '/product/update-status/:id/:status',
    categoryController.updateProductStatus
);

// Product Approval Routes
router.get(
    '/product/pending-approvals',
    authController.checkAdmin,
    authController.checkPermission('product', 'isView'),
    productApprovalController.getPendingProducts
);

router.get(
    '/product/approved',
    authController.checkAdmin,
    authController.checkPermission('product', 'isView'),
    productApprovalController.getApprovedProducts
);

router.get(
    '/product/rejected',
    authController.checkAdmin,
    authController.checkPermission('product', 'isView'),
    productApprovalController.getRejectedProducts
);

router.get(
    '/product/approval-view/:id',
    authController.checkAdmin,
    authController.checkPermission('product', 'isView'),
    productApprovalController.getProductApprovalView
);

router.post(
    '/product/approve/:id',
    authController.checkAdmin,
    authController.checkPermission('product', 'isEdit'),
    productApprovalController.approveProduct
);

router.post(
    '/product/reject/:id',
    authController.checkAdmin,
    authController.checkPermission('product', 'isEdit'),
    productApprovalController.rejectProduct
);

router.post(
    '/product/reset-approval/:id',
    authController.checkAdmin,
    authController.checkPermission('product', 'isEdit'),
    productApprovalController.resetApprovalStatus
);

module.exports = router;
