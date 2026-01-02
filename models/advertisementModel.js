// models/advertisementModel.js
const mongoose = require('mongoose');

const advertisementSchema = new mongoose.Schema(
    {
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        // Advertisement details
        title: {
            type: String,
            // required: true,
            trim: true,
        },
        description: {
            type: String,
            trim: true,
        },
        image: {
            type: String,
            required: true,
        },
        // Duration and scheduling
        numberOfDays: {
            type: Number,
            required: true,
            min: 1,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            required: true,
        },
        // Pricing
        pricePerDay: {
            type: Number,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'AUD',
        },
        // Stripe payment details
        stripePaymentIntentId: {
            type: String,
            required: true,
        },
        stripeChargeId: {
            type: String,
        },
        // Payment status
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        paidAt: {
            type: Date,
        },
        // Advertisement status
        status: {
            type: String,
            enum: ['pending', 'active', 'completed', 'cancelled', 'rejected'],
            default: 'pending',
        },
        // Admin approval
        approvalStatus: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'approved',
        },
        // approvalReason: {
        //     type: String,
        // },
        // approvalDate: {
        //     type: Date,
        // },
        // approvedBy: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: 'admin',
        // },
        // Analytics
        // views: {
        //     type: Number,
        //     default: 0,
        // },
        // clicks: {
        //     type: Number,
        //     default: 0,
        // },
        // Refund details
        // refundAmount: {
        //     type: Number,
        //     default: 0,
        // },
        // stripeRefundId: {
        //     type: String,
        // },
        // refundedAt: {
        //     type: Date,
        // },
        // refundReason: {
        //     type: String,
        // },
        // Additional metadata
        metadata: {
            type: Map,
            of: String,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);

// Index for efficient queries
advertisementSchema.index({ seller: 1, status: 1 });
advertisementSchema.index({ startDate: 1, endDate: 1, status: 1 });
advertisementSchema.index({ approvalStatus: 1 });

// Virtual to check if advertisement is currently running
advertisementSchema.virtual('isRunning').get(function () {
    const now = new Date();
    return (
        this.status === 'active' &&
        this.paymentStatus === 'paid' &&
        this.startDate <= now &&
        this.endDate >= now
    );
});

// Method to check if advertisement has expired
advertisementSchema.methods.checkExpiry = function () {
    const now = new Date();
    if (this.status === 'active' && this.endDate < now) {
        this.status = 'completed';
        return true;
    }
    return false;
};

module.exports = mongoose.model('Advertisement', advertisementSchema);
