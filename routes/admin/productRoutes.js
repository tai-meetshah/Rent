const router = require('express').Router();
const multer = require('multer');
const authController = require('../../controllers/admin/authController');

const categoryController = require('../../controllers/admin/categoryController');

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

module.exports = router;
