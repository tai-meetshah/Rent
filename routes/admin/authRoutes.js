const router = require('express').Router();
const authController = require('../../controllers/admin/authController');
const uploadController = require('../../controllers/uploadController');

router
    .route('/login')
    .get(authController.getLogin)
    .post(authController.postLogin);
router.get('/logout', authController.logout);

router
    .route('/forgot')
    .get(authController.getForgot)
    .post(authController.postForgot);

router
    .route('/reset')
    .get(authController.getReset)
    .post(authController.postReset);

router.post('/auth', authController.authenticate);

//Middleware
router.use(authController.checkAdmin);

router
    .route('/profile')
    .get(authController.getProfile)
    .post(uploadController.upload.single('image'), authController.postProfile);

router.get('/', authController.getDashboard);

router
    .route('/changepass')
    .get(authController.getChangePass)
    .post(authController.postChangePass);

module.exports = router;
