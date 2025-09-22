const router = require('express').Router();
const authController = require('../../controllers/admin/authController');

const userController = require('../../controllers/admin/userController');


router.get('/retailer', userController.getEnquiries);
router.get('/chat/:id', userController.getChat);
router.post('/sendChat/:id', userController.sendChat);
router.get('/endChat/:id', userController.endChat);

module.exports = router;
