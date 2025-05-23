const router = require('express').Router();
const multer = require('multer');
const authController = require('../../controllers/admin/authController');

const bannerController = require('../../controllers/admin/bannerController');

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
    '/',
    authController.checkPermission('banner', 'isView'),
    bannerController.getBanners
);

router
    .route('/create-banner')
    .get(bannerController.getAddBanner)
    .post(
        upload.fields([{ name: 'image', maxCount: 1 }]),
        bannerController.postAddBanner
    );

router
    .route('/update-banner/:id')
    .get(bannerController.getEditBanner)
    .post(
        upload.fields([{ name: 'image', maxCount: 1 }]),
        bannerController.postEditBanner
    );

router.get('/delete/:id', bannerController.getDeleteBanner);

module.exports = router;
