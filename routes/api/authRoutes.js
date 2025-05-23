const router = require('express').Router();
const { upload } = require('../../controllers/uploadController');
const authController = require('../../controllers/api/authController');

/* ===================================================
                USER AUTH API
======================================================*/

router.post('/user/sendOtp', upload.none(), authController.sendOtp);
router.post('/user/verifyOtp', upload.none(), authController.verifyOtp);
router.post('/user/resendOtp', upload.none(), authController.resendOtp);
router.post('/user/signup', upload.none(), authController.signUp);
router.post('/user/login', upload.none(), authController.login);
router.post(
    '/user/forgotPassword',
    upload.none(),
    authController.forgotPassword
);
router.post('/user/resetPassword', upload.none(), authController.resetPassword);
router.post(
    '/user/changePassword',
    authController.checkUser,
    upload.none(),
    authController.changePassword
);
router.get(
    '/user/getProfile',
    authController.checkUser,
    upload.none(),
    authController.getProfile
);
router.put(
    '/user/editProfile',
    authController.checkUser,
    upload.none(),
    authController.editProfile
);
router.post(
    '/user/updateNotification/:status',
    authController.checkUser,
    upload.none(),
    authController.updateNotification
);
router.delete(
    '/user/deleteAccount',
    authController.checkUser,
    upload.none(),
    authController.deleteAccount
);
// router.put('/updateLocation', checkUser, upload.none(), authController.updateLocation);

/* ===================================================
                VENDOR AUTH API
======================================================*/

router.post('/vendor/sendOtp', upload.none(), authController.sendOtpVendor);
router.post('/vendor/verifyOtp', upload.none(), authController.verifyOtpVendor);
router.post('/vendor/resendOtp', upload.none(), authController.resendOtpVendor);

router.post('/vendor/signup', upload.none(), authController.signUpVendor);
router.post(
    '/vendor/addBusinessInfo',
    authController.isVendor,
    upload.fields([
        { name: 'businessLogo', maxCount: 1 },
        { name: 'businessLicense', maxCount: 1 },
    ]),
    authController.addBusinessInfo
);
router.post(
    '/vendor/addBusinessMenu',
    authController.isVendor,
    upload.fields([{ name: 'image', maxCount: 10 }]),
    authController.addBusinessMenu
);

router.get(
    '/dashboardVendor',
    authController.checkVendor,
    authController.dashboardVendor
);
router.post('/vendor/login', upload.none(), authController.loginVendor);
router.post(
    '/vendor/forgotPassword',
    upload.none(),
    authController.forgotPasswordVendor
);
router.post(
    '/vendor/resetPassword',
    upload.none(),
    authController.resetPasswordVendor
);

router.get(
    '/vendor/getProfile',
    authController.checkVendor,
    upload.none(),
    authController.getProfileVendor
);

router.put(
    '/vendor/updateBusinessInfo',
    authController.checkVendor,
    upload.fields([
        { name: 'businessLogo', maxCount: 1 },
        { name: 'businessLicense', maxCount: 1 },
    ]),
    authController.updateBusinessInfo
);

router.post(
    '/vendor/addSingleMenu',
    authController.checkVendor,
    upload.single('image'),
    authController.addSingleMenu
);
router.delete(
    '/vendor/deleteMenu/:image',
    authController.checkVendor,
    upload.none(),
    authController.deleteMenu
);

router.post(
    '/vendor/changePassword',
    authController.checkVendor,
    upload.none(),
    authController.changePasswordVendor
);
router.post(
    '/vendor/updateNotification/:status',
    authController.checkVendor,
    upload.none(),
    authController.updateNotificationVendor
);
router.delete(
    '/vendor/deleteAccount',
    authController.checkVendor,
    upload.none(),
    authController.deleteAccountVendor
);

module.exports = router;
