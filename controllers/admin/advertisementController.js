// controllers/admin/advertisementController.js
const Advertisement = require('../../models/advertisementModel');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const userNotificationModel = require('../../models/userNotificationModel');

// Get all advertisements (admin)
exports.getAllAdvertisements = async (req, res, next) => {
    try {
        const { status, approvalStatus, page = 1, limit = 20 } = req.query;

        const query = {};
        if (status) query.status = status;
        if (approvalStatus) query.approvalStatus = approvalStatus;

        const advertisements = await Advertisement.find(query)
            .populate('seller', 'name email')
            .populate('product', 'title images')
            .sort('-createdAt')
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const total = await Advertisement.countDocuments(query);

        res.status(200).json({
            success: true,
            data: advertisements,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        console.error('Error fetching advertisements:', error);
        next(error);
    }
};

// Approve advertisement
exports.approveAdvertisement = async (req, res, next) => {
    try {
        const { advertisementId } = req.body;

        const advertisement = await Advertisement.findById(advertisementId)
            .populate('seller', 'name email fcmToken')
            .populate('product', 'title');

        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: 'Advertisement not found.',
            });
        }

        advertisement.approvalStatus = 'approved';
        advertisement.status = 'active';
        advertisement.approvalDate = new Date();
        advertisement.approvedBy = req.admin.id;
        await advertisement.save();

        // Send notification to seller
        if (advertisement.seller.fcmToken) {
            await sendNotificationsToTokens(
                'Advertisement Approved',
                `Your advertisement for ${advertisement.product.title} has been approved and is now live!`,
                [advertisement.seller.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [advertisement.seller._id],
                title: 'Advertisement Approved',
                body: `Your advertisement for ${
                    advertisement.product.title
                } is now active and will run from ${advertisement.startDate.toLocaleDateString()} to ${advertisement.endDate.toLocaleDateString()}.`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Advertisement approved successfully.',
            advertisement,
        });
    } catch (error) {
        console.error('Error approving advertisement:', error);
        next(error);
    }
};

// Reject advertisement
exports.rejectAdvertisement = async (req, res, next) => {
    try {
        const { advertisementId, reason } = req.body;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required.',
            });
        }

        const advertisement = await Advertisement.findById(advertisementId)
            .populate('seller', 'name email fcmToken')
            .populate('product', 'title');

        if (!advertisement) {
            return res.status(404).json({
                success: false,
                message: 'Advertisement not found.',
            });
        }

        advertisement.approvalStatus = 'rejected';
        advertisement.status = 'rejected';
        advertisement.approvalReason = reason;
        advertisement.approvalDate = new Date();
        advertisement.approvedBy = req.admin.id;
        await advertisement.save();

        // Send notification to seller
        if (advertisement.seller.fcmToken) {
            await sendNotificationsToTokens(
                'Advertisement Rejected',
                `Your advertisement for ${advertisement.product.title} was rejected. Reason: ${reason}`,
                [advertisement.seller.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [advertisement.seller._id],
                title: 'Advertisement Rejected',
                body: `Your advertisement for ${advertisement.product.title} was rejected. Reason: ${reason}. A refund will be processed.`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Advertisement rejected successfully.',
            advertisement,
        });
    } catch (error) {
        console.error('Error rejecting advertisement:', error);
        next(error);
    }
};

// Get advertisement statistics
exports.getAdvertisementStatistics = async (req, res, next) => {
    try {
        const totalAds = await Advertisement.countDocuments();
        const activeAds = await Advertisement.countDocuments({
            status: 'active',
            paymentStatus: 'paid',
        });
        const pendingApproval = await Advertisement.countDocuments({
            approvalStatus: 'pending',
        });
        const completedAds = await Advertisement.countDocuments({
            status: 'completed',
        });

        // Revenue calculation
        const revenueResult = await Advertisement.aggregate([
            { $match: { paymentStatus: 'paid' } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                },
            },
        ]);

        const totalRevenue = revenueResult[0]?.totalRevenue || 0;

        // Top advertisers
        const topAdvertisers = await Advertisement.aggregate([
            { $match: { paymentStatus: 'paid' } },
            {
                $group: {
                    _id: '$seller',
                    totalSpent: { $sum: '$totalAmount' },
                    adCount: { $sum: 1 },
                },
            },
            { $sort: { totalSpent: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'seller',
                },
            },
            { $unwind: '$seller' },
            {
                $project: {
                    sellerName: '$seller.name',
                    sellerEmail: '$seller.email',
                    totalSpent: 1,
                    adCount: 1,
                },
            },
        ]);

        res.status(200).json({
            success: true,
            statistics: {
                totalAds,
                activeAds,
                pendingApproval,
                completedAds,
                totalRevenue,
                topAdvertisers,
            },
        });
    } catch (error) {
        console.error('Error fetching statistics:', error);
        next(error);
    }
};

// Update advertisement pricing
exports.updateAdvertisementPricing = async (req, res, next) => {
    try {
        const { pricePerDay } = req.body;
        const AdminCommission = require('../../models/AdminCommission');

        if (!pricePerDay || pricePerDay <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid price per day is required.',
            });
        }

        const settings = await AdminCommission.findOne({ isActive: true });
        if (!settings) {
            return res.status(404).json({
                success: false,
                message: 'Admin settings not found.',
            });
        }

        settings.advertisementPricePerDay = pricePerDay;
        await settings.save();

        res.status(200).json({
            success: true,
            message: 'Advertisement pricing updated successfully.',
            pricePerDay,
        });
    } catch (error) {
        console.error('Error updating pricing:', error);
        next(error);
    }
};
