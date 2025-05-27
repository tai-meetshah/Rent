const router = require('express').Router();
const multer = require('multer');
const { checkUser } = require('../../controllers/api/authController');

const productController = require('../../controllers/api/productController');

router.get('/category', checkUser, productController.getAllCategories);

module.exports = router;
