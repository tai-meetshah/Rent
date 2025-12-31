const mongoose = require('mongoose');

const adminCommissionSchema = new mongoose.Schema(
    {
        commissionType: {
            type: String,
            enum: ['fixed', 'percentage'],
            required: true,
        },
        fixedAmount: {
            type: Number,
        },
        firstUserDiscount: {
            type: Number,
        },
        percentage: {
            type: Number,
        },
        subscriptionAmount: {
            type: Number,
            default: 2.5,
            required: true,
        },
        advertisementPricePerDay: {
            type: Number,
            default: 5.0, // AUD $5 per day
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

module.exports = new mongoose.model('AdminCommission', adminCommissionSchema);
