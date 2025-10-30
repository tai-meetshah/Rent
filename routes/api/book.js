const router = require('express').Router();
const fileUpload = require('express-fileupload');
const { upload } = require('../../controllers/uploadController');
const { checkUser } = require('../../controllers/api/authController');

const bookingController = require('../../controllers/api/bookingController');

router.post('/:id/return-photos', upload.array('photos', 6), checkUser, bookingController.uploadReturnPhotos);
router.post('/:id/reupload-photo', upload.single('photo'), checkUser, bookingController.reuploadRejectedPhoto);


module.exports = router;
