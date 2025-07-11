const router = require('express').Router();
const multer = require('multer');
const { checkUser } = require('../../controllers/api/authController');
const fileUpload = require('express-fileupload');
const { upload } = require('../../controllers/uploadController');

const productController = require('../../controllers/api/productController');

router.get('/category', checkUser, productController.getAllCategories);

router.post(
    '/category/:categoryId',
    fileUpload(),
    productController.getCategoryWithSubcategories
);

router.get('/subcategory', productController.getAllSubcategories);
router.post(
    '/create-product-step-1',
    upload.array('images', 6),
    productController.createProductStep1
);
module.exports = router;
