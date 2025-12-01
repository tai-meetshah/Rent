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
        // Stripe fees
        stripeProcessingFee: {
            type: Number,
            default: 0,
            comment: 'Stripe payment processing fee (1.75% + $0.30)',
        },
        stripeTransferFee: {
            type: Number,
            default: 0,
            comment: 'Stripe transfer fee (if applicable)',
        },
        stripeTotalFee: {
            type: Number,
            default: 0,
            comment: 'Total Stripe fees (processing + transfer)',
        },
        netOwnerPayout: {
            type: Number,
            comment: 'Final payout after all deductions including Stripe fees',
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
            enum: ['pending', 'scheduled', 'processing', 'paid', 'failed'],
            default: 'pending',
        },
        // Scheduled payout date (15 days after return verification)
        scheduledPayoutDate: {
            type: Date,
        },
        payoutEligibleDate: {
            type: Date,
        },
        // Refund details
        refundAmount: {
            type: Number,
            default: 0,
        },

        refundReason: String,
        rentalDays: String,
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
        // Cancellation split: admin commission and vendor share of the cancellation charge
        cancellationAdminCommission: {
            type: Number,
            default: 0,
        },
        cancellationVendorAmount: {
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
        depositRefunded: Boolean,
        depositRefundedAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
