const router = require('express').Router();
const { upload } = require('../../controllers/uploadController');
const authController = require('../../controllers/api/authController');

// router.post('/user/sendOtp', upload.none(), authController.sendOtp);
// router.post('/user/verifyOtp', upload.none(), authController.verifyOtp);
// router.post('/user/resendOtp', upload.none(), authController.resendOtp);

router.post('/user/socialLogin', upload.none(), authController.socialLogin);

router.post(
    '/user/createSocialProfile',
    upload.none(),
    authController.createSocialProfile
);
router.post('/user/signup', upload.none(), authController.signUp);
router.post('/user/login', upload.none(), authController.login);
router.post(
    '/user/forgotPassword',
    upload.none(),
    authController.forgotPassword
);
router.post('/user/resetPassword', upload.none(), authController.resetPassword);
// router.post(
//     '/user/changePassword',
//     authController.checkUser,
//     upload.none(),
//     authController.changePassword
// );
router.get(
    '/user/getProfile',
    authController.checkUser,
    upload.none(),
    authController.getProfile
);
router.put(
    '/user/editProfile',
    authController.checkUser,
    upload.single('photo'),
    authController.editProfile
);
// router.post(
//     '/user/updateNotification/:status',
//     authController.checkUser,
//     upload.none(),
//     authController.updateNotification
// );
// router.delete(
//     '/user/deleteAccount',
//     authController.checkUser,
//     upload.none(),
//     authController.deleteAccount
// );

module.exports = router;
