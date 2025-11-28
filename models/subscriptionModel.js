// models/subscriptionModel.js
const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        // Subscription details
        subscriptionType: {
            type: String,
            enum: ['monthly', 'yearly', 'lifetime'],
            default: 'monthly',
        },
        amount: {
            type: Number,
            required: true,
        },
        currency: {
            type: String,
            default: 'AUD',
        },
        // Payment details - goes to admin
        adminAmount: {
            type: Number,
            required: true,
        },
        // Stripe details
        stripePaymentIntentId: {
            type: String,
            required: true,
        },
        stripeChargeId: {
            type: String,
        },
        // Stripe Subscription ID (for recurring subscriptions)
        stripeSubscriptionId: {
            type: String,
            default: null,
        },
        stripePriceId: {
            type: String,
            default: null,
        },
        stripeCustomerId: {
            type: String,
            default: null,
        },
        // Auto-renewal settings
        autoRenew: {
            type: Boolean,
            default: false,
        },
        renewalAttempts: {
            type: Number,
            default: 0,
        },
        lastRenewalAttempt: {
            type: Date,
        },
        lastRenewalError: {
            type: String,
        },
        // Card details (for display purposes)
        cardLast4: {
            type: String,
            default: null,
        },
        cardBrand: {
            type: String,
            default: null,
        },
        cardExpMonth: {
            type: Number,
            default: null,
        },
        cardExpYear: {
            type: Number,
            default: null,
        },
        // Payment status
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed', 'refunded'],
            default: 'pending',
        },
        // Subscription period
        startDate: {
            type: Date,
        },
        expiresAt: {
            type: Date,
        },
        // Status
        isActive: {
            type: Boolean,
            default: false,
        },
        cancelledAt: {
            type: Date,
        },
        paidAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Subscription', subscriptionSchema);
