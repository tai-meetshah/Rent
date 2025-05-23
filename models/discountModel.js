const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema(
    {
        vendor : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
        },
        title: {
            type: String,
            required: true
        },
        totalUserCount: {
            type: Number,
            required: true
        },
        redeemUserCount: {
            type: Number,
            default: 0
        },
        remainingUserCount: {
            type: Number,
            // default: 50
        },
        status: {
            type: String,
            enum: ['Active', 'Inactive', 'Expired'],
            required: true,
        },
        customerType: [
            String
        ],
        minBillAmount: {
            type: Number,
            required: true,
        },
        discountType: {
            type: String,
            enum: ['Percentage', 'Fixed']
        },
        discountValue: {
            type: Number,
        },
        couponUsage: {
            type: Number,
        },
        expiryDate: {
            type: String
        },
        description: {
            type: String,
        },
        adminApprovedStatus: {
            type: String,
            enum: ['Pending', 'Approved', 'Rejected'],
            default: 'Pending'
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Discount', discountSchema);
