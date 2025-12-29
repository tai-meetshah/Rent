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

        // Payment amounts
        totalAmount: { type: Number, required: true },
        depositAmount: { type: Number, default: 0 },
        rentalAmount: { type: Number, required: true },
        adminFee: { type: Number },
        deliveryCharge: { type: Number, default: 0 },
        // Commission details
        commissionType: {
            type: String,
            enum: ['fixed', 'percentage'],
            required: true,
        },
        commissionPercentage: Number,
        commissionFixedAmount: Number,
        commissionAmount: { type: Number, required: true },

        ownerPayoutAmount: { type: Number, required: true },

        firstUserDiscount: {
            type: Number,
            default: 0,
        },
        firstUserDiscountPercentage: {
            type: Number,
            default: 0,
        },
        isFirstTimeUser: {
            type: Boolean,
            default: false,
        },
        // Stripe fees
        stripeProcessingFee: { type: Number, default: 0 },
        stripeTransferFee: { type: Number, default: 0 },
        stripeTotalFee: { type: Number, default: 0 },

        netOwnerPayout: Number,

        currency: { type: String, default: 'AUD' },

        // Stripe details
        stripePaymentIntentId: String,
        stripeChargeId: String,
        stripeTransferId: String,

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

        scheduledPayoutDate: Date,
        payoutEligibleDate: Date,

        // Refunds
        refundAmount: { type: Number, default: 0 },
        refundReason: String,
        rentalDays: String,
        stripeRefundId: String,

        // Cancellation
        cancellationCharges: { type: Number, default: 0 },
        cancellationChargesPercentage: { type: Number, default: 0 },

        cancellationAdminCommission: { type: Number, default: 0 },
        cancellationVendorAmount: { type: Number, default: 0 },

        // NEW fields for cancellation payout flow
        cancellationPayout: {
            type: Boolean,
            default: false,
        },
        cancellationPayoutStatus: {
            type: String,
            enum: ['pending', 'scheduled', 'paid', 'failed'],
            default: 'pending',
        },

        // Dates
        paidAt: Date,
        payoutAt: Date,
        refundedAt: Date,
        depositRefundId: String,
        depositRefunded: Boolean,
        depositRefundedAt: Date,

        stripeCharges: {
            // Initial payment charges
            paymentProcessingFee: { type: Number, default: 0 },
            paymentFixedFee: { type: Number, default: 0 },
            paymentTotalFee: { type: Number, default: 0 },

            // Refund charges (if applicable)
            refundProcessingFee: { type: Number, default: 0 },
            refundFixedFee: { type: Number, default: 0 },
            refundTotalFee: { type: Number, default: 0 },

            // Transfer charges (payout to owner)
            transferFee: { type: Number, default: 0 },

            // Total stripe charges across all operations
            totalStripeCharges: { type: Number, default: 0 },

            // Breakdown by operation
            chargesBreakdown: [
                {
                    operation: {
                        type: String,
                        enum: [
                            'payment',
                            'refund',
                            'transfer',
                            'deposit_refund',
                        ],
                    },
                    amount: { type: Number },
                    fee: { type: Number },
                    timestamp: { type: Date, default: Date.now },
                    stripeId: { type: String }, // charge/refund/transfer ID
                    description: { type: String },
                },
            ],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Payment', paymentSchema);
