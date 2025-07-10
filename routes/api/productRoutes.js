const router = require('express').Router();
const multer = require('multer');
const { checkUser } = require('../../controllers/api/authController');
const fileUpload = require('express-fileupload');

const productController = require('../../controllers/api/productController');

router.get('/category', checkUser, productController.getAllCategories);

router.post(
     '/category/:categoryId',
     fileUpload(),
     productController.getCategoryWithSubcategories
);

router.get('/subcategory', productController.getAllSubcategories);
module.exports = router;
