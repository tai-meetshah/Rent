const router = require('express').Router();
const { upload } = require('../../controllers/uploadController');
const authController = require('../../controllers/api/authController');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');

// router.post('/user/sendOtp', upload.none(), authController.sendOtp);
// router.post('/user/verifyOtp', upload.none(), authController.verifyOtp);
// router.post('/user/resendOtp', upload.none(), authController.resendOtp);

router.post('/send', upload.none(), async (req, res) => {

    const { rt } = req.body;
    let title = 'test title'
    let body = 'test'
    try {
        const response = await sendNotificationsToTokens(title, body, rt);
        res.status(200).json({ success: true, response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
router.delete(
    '/user/deleteAccount',
    authController.checkUser,
    upload.none(),
    authController.deleteAccount
);
router.get(
    '/notification-list',
    upload.none(),
    authController.checkUser,
    authController.notificationListUser
);
router.delete(
    '/notification-clear',
    upload.none(),
    authController.checkUser,
    authController.clearNotifications
);
module.exports = router;
