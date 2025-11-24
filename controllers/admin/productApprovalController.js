const Product = require('../../models/product');
const userNotificationModel = require('../../models/userNotificationModel');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');

exports.getPendingProducts = async (req, res) => {
    try {
        const pendingProducts = await Product.find({
            approvalStatus: 'pending',
            isDeleted: false
        })
        .populate('user', 'name email')
        .populate('category', 'name')
        .sort({ createdAt: -1 });

        res.render('product_pending', { products: pendingProducts });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getApprovedProducts = async (req, res) => {
    try {
        const approvedProducts = await Product.find({
            approvalStatus: 'approved',
            isDeleted: false
        })
        .populate('user', 'name email')
        .populate('category', 'name')
        .populate('approvedBy', 'name')
        .sort({ approvalDate: -1 });

        res.render('product_approved', { products: approvedProducts });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getRejectedProducts = async (req, res) => {
    try {
        const rejectedProducts = await Product.find({
            approvalStatus: 'rejected',
            isDeleted: false
        })
        .populate('user', 'name email')
        .populate('category', 'name')
        .populate('approvedBy', 'name')
        .sort({ approvalDate: -1 });

        res.render('product_rejected', { products: rejectedProducts });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getProductApprovalView = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id)
            .populate('user', 'name email phone')
            .populate('category', 'name')
            .populate('subcategory', 'name')
            .populate('approvedBy', 'name email');

        if (!product) {
            req.flash('red', 'Product not found.');
            return res.redirect('/admin/product/pending-approvals');
        }

        res.render('product_approval_view', { product });
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/product/pending-approvals');
    }
};

exports.approveProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('user', 'name email fcmToken');

        if (!product) {
            req.flash('red', 'Product not found.');
            return res.redirect('/admin/product/pending-approvals');
        }

        if (product.approvalStatus === 'approved') {
            req.flash('red', 'Product is already approved.');
            return res.redirect('/admin/product/pending-approvals');
        }

        product.approvalStatus = 'approved';
        product.approvalDate = new Date();
        product.approvedBy = req.admin._id;
        product.approvalReason = req.body.reason || 'Product meets all requirements';
        product.isActive = true;

        await product.save();

        // Send notification to the product owner
        if (product.user) {
            const title = 'Product Approved';
            const body = `Congratulations! Your product "${product.title}" has been approved and is now live on the platform.`;

            // Send push notification
            if (product.user.fcmToken) {
                try {
                    await sendNotificationsToTokens(title, body, [product.user.fcmToken]);
                } catch (notifError) {
                    console.log('Error sending push notification:', notifError);
                }
            }

            // Save notification in DB
            await userNotificationModel.create({
                sentTo: [product.user._id],
                title,
                body,
            });
        }

        req.flash('green', 'Product approved successfully.');
        res.redirect('/admin/product');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/product/pending-approvals');
    }
};

exports.rejectProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('user', 'name email fcmToken');

        if (!product) {
            req.flash('red', 'Product not found.');
            return res.redirect('/admin/product/pending-approvals');
        }

        if (product.approvalStatus === 'rejected') {
            req.flash('red', 'Product is already rejected.');
            return res.redirect('/admin/product/pending-approvals');
        }

        if (!req.body.reason || req.body.reason.trim() === '') {
            req.flash('red', 'Rejection reason is required.');
            return res.redirect(`/admin/product/approval-view/${req.params.id}`);
        }

        product.approvalStatus = 'rejected';
        product.approvalDate = new Date();
        product.approvedBy = req.admin._id;
        product.approvalReason = req.body.reason;
        product.isActive = false;

        await product.save();

        // Send notification to the product owner
        if (product.user) {
            const title = 'Product Rejected';
            const body = `Your product "${product.title}" has been rejected. Reason: ${req.body.reason}`;

            // Send push notification
            if (product.user.fcmToken) {
                try {
                    await sendNotificationsToTokens(title, body, [product.user.fcmToken]);
                } catch (notifError) {
                    console.log('Error sending push notification:', notifError);
                }
            }

            // Save notification in DB
            await userNotificationModel.create({
                sentTo: [product.user._id],
                title,
                body,
            });
        }

        req.flash('green', 'Product rejected successfully.');
        res.redirect('/admin/product');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/product/pending-approvals');
    }
};

exports.resetApprovalStatus = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            req.flash('red', 'Product not found.');
            return res.redirect('/admin/product');
        }

        product.approvalStatus = 'pending';
        product.approvalDate = null;
        product.approvedBy = null;
        product.approvalReason = null;

        await product.save();

        req.flash('green', 'Product approval status reset to pending.');
        res.redirect('/admin/product/pending-approvals');
    } catch (error) {
        req.flash('red', error.message);
        res.redirect('/admin/product');
    }
};
