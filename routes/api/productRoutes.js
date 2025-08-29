const router = require('express').Router();
const multer = require('multer');
const { checkUser } = require('../../controllers/api/authController');
const fileUpload = require('express-fileupload');
const { upload } = require('../../controllers/uploadController');

const productController = require('../../controllers/api/productController');

router.get('/category', checkUser, productController.getAllCategories);
router.get('/user-product', checkUser, productController.getAllProduct);
router.post('/all-product', fileUpload(), checkUser, productController.getProducts);
router.post('/feature-product', fileUpload(), checkUser, productController.getAllFeatureProduct);
router.get('/feature-product/:productId', checkUser, productController.getFeatureProductById);

router.post(
    '/category/:categoryId',
    fileUpload(),
    productController.getCategoryWithSubcategories
);

router.get('/subcategory', productController.getAllSubcategories);
router.post(
    '/create-product-step-1',
    upload.array('images', 6),
    checkUser,
    productController.createProductStep1
);
router.post(
    '/create-product-step-2',
    fileUpload(),
    checkUser,
    productController.createProductStep2
);

router.post(
    '/edit-product-step-1',
    upload.array('images', 6),
    checkUser,
    productController.editProductStep1
);
router.post(
    '/edit-product-step-2',
    fileUpload(),
    checkUser,
    productController.editProductStep2
);
router.post('/status-change', fileUpload(), checkUser, productController.activeDeactiveProduct);
router.post('/cancell-product', fileUpload(), checkUser, productController.cancellProduct);
router.post('/delete-product', fileUpload(), checkUser, productController.deleteProduct);
router.post('/remove-image', fileUpload(), checkUser, productController.deleteProductImg)

router.post('/search-history', fileUpload(), checkUser, productController.saveSearch);
router.get('/search-history', checkUser, productController.getSearchHistory);
router.delete('/search-history/:id', checkUser, productController.deleteSearchTerm);
router.delete('/search-history-clear', checkUser, productController.clearSearchHistory);

module.exports = router;
