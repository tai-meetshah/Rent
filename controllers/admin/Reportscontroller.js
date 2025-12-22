const Payment = require('../../models/paymentModel');
const Booking = require('../../models/Booking');
const User = require('../../models/userModel');
const Product = require('../../models/product');

exports.getReports = async (req, res) => {
    try {
        const { startDate, endDate, period = 'all' } = req.query;

        // Calculate date range based on period
        let dateFilter = {};
        const now = new Date();

        if (period === 'today') {
            const today = new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate()
            );
            dateFilter = { createdAt: { $gte: today } };
        } else if (period === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: weekAgo } };
        } else if (period === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: monthAgo } };
        } else if (period === 'year') {
            const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: yearAgo } };
        } else if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                },
            };
        }

        // Get payment statistics
        const paymentStats = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: '$totalAmount' },
                    totalCommission: { $sum: '$commissionAmount' },
                    totalOwnerPayout: { $sum: '$ownerPayoutAmount' },
                    totalTransactions: { $sum: 1 },
                    totalDeposit: { $sum: '$depositAmount' },
                },
            },
        ]);

        const stats = paymentStats[0] || {
            totalRevenue: 0,
            totalCommission: 0,
            totalOwnerPayout: 0,
            totalTransactions: 0,
            totalDeposit: 0,
        };

        // Get refund statistics
        const refundStats = await Payment.aggregate([
            {
                $match: {
                    paymentStatus: { $in: ['refunded', 'partially_refunded'] },
                    ...dateFilter,
                },
            },
            {
                $group: {
                    _id: null,
                    totalRefunded: { $sum: '$refundAmount' },
                    refundCount: { $sum: 1 },
                },
            },
        ]);

        const refunds = refundStats[0] || {
            totalRefunded: 0,
            refundCount: 0,
        };

        // Get revenue trend (monthly) - show last 12 months regardless of filter
        const twelveMonthsAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        const revenueTrend = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', createdAt: { $gte: twelveMonthsAgo } } },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                    },
                    revenue: { $sum: '$totalAmount' },
                    commission: { $sum: '$commissionAmount' },
                    transactions: { $sum: 1 },
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1 } },
        ]);

        // Get top products by revenue
        const topProducts = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: '$product',
                    totalRevenue: { $sum: '$totalAmount' },
                    totalCommission: { $sum: '$commissionAmount' },
                    bookings: { $sum: 1 },
                },
            },
            { $sort: { totalRevenue: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'products',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'productDetails',
                },
            },
            { $unwind: '$productDetails' },
        ]);

        // Get top owners by revenue
        const topOwners = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: '$owner',
                    totalEarnings: { $sum: '$ownerPayoutAmount' },
                    totalCommission: { $sum: '$commissionAmount' },
                    bookings: { $sum: 1 },
                },
            },
            { $sort: { totalEarnings: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'ownerDetails',
                },
            },
            { $unwind: '$ownerDetails' },
        ]);

        // Get booking statistics
        const bookingStats = await Booking.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                },
            },
        ]);

        // Get payment method distribution
        const paymentMethods = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: '$payment',
                    count: { $sum: 1 },
                    amount: { $sum: '$totalAmount' },
                },
            },
        ]);

        // Calculate commission breakdown by type
        const commissionBreakdown = await Payment.aggregate([
            { $match: { paymentStatus: 'paid', ...dateFilter } },
            {
                $group: {
                    _id: '$commissionType',
                    totalCommission: { $sum: '$commissionAmount' },
                    count: { $sum: 1 },
                    avgCommission: { $avg: '$commissionAmount' },
                },
            },
        ]);

        res.render('reports', {
            stats,
            refunds,
            revenueTrend,
            topProducts,
            topOwners,
            bookingStats,
            paymentMethods,
            commissionBreakdown,
            period,
            startDate: startDate || '',
            endDate: endDate || '',
        });
    } catch (error) {
        console.error('Reports error:', error);
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getTransactions = async (req, res) => {
    try {
        const { page = 1, limit = 20, status, search } = req.query;

        let query = {};

        if (status && status !== 'all') {
            query.paymentStatus = status;
        }

        if (search) {
            const bookings = await Booking.find({
                $or: [{ _id: search }],
            }).select('_id');

            const bookingIds = bookings.map(b => b._id);
            query.booking = { $in: bookingIds };
        }

        const transactions = await Payment.find(query)
            .populate('booking')
            .populate('renter', 'name email')
            .populate('owner', 'name email')
            .populate('product', 'title images')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        const count = await Payment.countDocuments(query);

        res.render('transactions', {
            transactions,
            totalPages: Math.ceil(count / limit),
            currentPage: page,
            status: status || 'all',
            search: search || '',
        });
    } catch (error) {
        console.error('Transactions error:', error);
        req.flash('red', error.message);
        res.redirect('/admin');
    }
};

exports.getTransactionDetail = async (req, res) => {
    try {
        const transaction = await Payment.findById(req.params.id)
            .populate('booking')
            .populate('renter', 'name email photo')
            .populate('owner', 'name email photo')
            .populate(
                'product',
                'title images description oCancellationCharges'
            );

        if (!transaction) {
            req.flash('red', 'Transaction not found');
            return res.redirect('/admin/reports/transactions');
        }

        res.render('transaction_detail', { transaction });
    } catch (error) {
        console.error('Transaction detail error:', error);
        req.flash('red', error.message);
        res.redirect('/admin/reports/transactions');
    }
};

exports.exportReports = async (req, res) => {
    try {
        const { startDate, endDate, format = 'csv' } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                createdAt: {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate),
                },
            };
        }

        const payments = await Payment.find({
            ...dateFilter,
            paymentStatus: 'paid',
        })
            .populate('renter', 'name email')
            .populate('owner', 'name email')
            .populate('product', 'title')
            .sort({ createdAt: -1 });

        if (format === 'csv') {
            // Generate CSV
            let csv =
                'Date,Transaction ID,Renter,Owner,Product,Amount,Commission,Owner Payout,Status\n';

            payments.forEach(payment => {
                csv += `${payment.createdAt.toLocaleDateString()},`;
                csv += `${payment._id},`;
                csv += `${payment.renter?.name || 'N/A'},`;
                csv += `${payment.owner?.name || 'N/A'},`;
                csv += `${payment.product?.title || 'N/A'},`;
                csv += `${payment.totalAmount},`;
                csv += `${payment.commissionAmount},`;
                csv += `${payment.ownerPayoutAmount},`;
                csv += `${payment.paymentStatus}\n`;
            });

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=transactions-${Date.now()}.csv`
            );
            res.send(csv);
        } else {
            // Return JSON
            res.json({
                success: true,
                data: payments,
            });
        }
    } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};

exports.getUserActivity = async (req, res) => {
    try {
        const { period = 'month' } = req.query;

        let dateFilter = {};
        const now = new Date();

        if (period === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: weekAgo } };
        } else if (period === 'month') {
            const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            dateFilter = { createdAt: { $gte: monthAgo } };
        }

        // New users
        const newUsers = await User.countDocuments(dateFilter);

        // Active users (users who made bookings)
        const activeUsers = await Booking.distinct('user', dateFilter);

        // User engagement by day
        const userActivity = await Booking.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: {
                        year: { $year: '$createdAt' },
                        month: { $month: '$createdAt' },
                        day: { $dayOfMonth: '$createdAt' },
                    },
                    uniqueUsers: { $addToSet: '$user' },
                    bookings: { $sum: 1 },
                },
            },
            {
                $project: {
                    _id: 1,
                    userCount: { $size: '$uniqueUsers' },
                    bookings: 1,
                },
            },
            { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 } },
        ]);

        res.json({
            success: true,
            newUsers,
            activeUsers: activeUsers.length,
            userActivity,
        });
    } catch (error) {
        console.error('User activity error:', error);
        res.status(500).json({
            success: false,
            message: error.message,
        });
    }
};
