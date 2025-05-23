const router = require('express').Router();
const authController = require('../../controllers/admin/authController');

const cmsController = require('../../controllers/admin/cmsController');

router
    .route('/privacy')
    .get(
        authController.checkPermission('cms', 'isView'),
        cmsController.getPrivacy
    )
    .post(
        authController.checkPermission('cms', 'isAdd'),
        cmsController.postPrivacy
    );

router
    .route('/term')
    .get(authController.checkPermission('cms', 'isView'), cmsController.getTerm)
    .post(
        authController.checkPermission('cms', 'isAdd'),
        cmsController.postTerm
    );

router
    .route('/faq')
    .get(authController.checkPermission('cms', 'isView'), cmsController.getFaq);

router
    .route('/faq/add')
    .get(cmsController.getFaqAdd)
    .post(cmsController.postFaqAdd);

router
    .route('/faq/edit/:id')
    .get(cmsController.getFaqUpdate)
    .post(cmsController.postFaqUpdate);

router.route('/faq/delete/:id').get(cmsController.getFaqDelete);
module.exports = router;
