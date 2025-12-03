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
        percentage: {
            type: Number,
        },
        subscriptionAmount: {
            type: Number,
            default: 10,
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
