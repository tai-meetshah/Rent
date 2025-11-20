// models/paymentModel.js
const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
    {
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking',
            required: true,
        },
        renter: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        // Payment amounts in AUD
        totalAmount: {
            type: Number,
            required: true,
        },
        depositAmount: {
            type: Number,
            default: 0,
        },
        rentalAmount: {
            type: Number,
            required: true,
        },
        // Commission details
        commissionType: {
            type: String,
            enum: ['fixed', 'percentage'],
            required: true,
        },
        commissionPercentage: {
            type: Number,
        },
        commissionFixedAmount: {
            type: Number,
        },
        commissionAmount: {
            type: Number,
            required: true,
        },
        ownerPayoutAmount: {
            type: Number,
            required: true,
        },
        // Currency
        currency: {
            type: String,
            default: 'AUD',
        },
        // Stripe details
        stripePaymentIntentId: {
            type: String,
        },
        stripeChargeId: {
            type: String,
        },
        stripeTransferId: {
            type: String,
        },
        // Payment status
        paymentStatus: {
            type: String,
            enum: [
                'pending',
                'paid',
                'held',
                'refunded',
                'partially_refunded',
                'failed',
            ],
            default: 'pending',
        },
        payoutStatus: {
            type: String,
            enum: ['pending', 'processing', 'paid', 'failed'],
            default: 'pending',
        },
        // Refund details
        refundAmount: {
            type: Number,
            default: 0,
        },

        refundReason: String,
        stripeRefundId: String,
        // Cancellation
        cancellationCharges: {
            type: Number,
            default: 0,
        },
        cancellationChargesPercentage: {
            type: Number,
            default: 0,
        },
        // Dates
        paidAt: Date,
        payoutAt: Date,
        refundedAt: Date,
        depositRefundId: {
            type: String,
        },
        depositRefunded : Boolean,
        depositRefundedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
