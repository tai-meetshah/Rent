// routes/api/paymentRoutes.js
const router = require('express').Router();
const express = require('express');
const fileUpload = require('express-fileupload');
const { checkUser } = require('../../controllers/api/authController');
const paymentController = require('../../controllers/api/paymentController');

// Create payment intent
router.post(
    '/create-payment-intent',
    fileUpload(),
    checkUser,
    paymentController.createPaymentIntent
);

// Confirm payment
router.post(
    '/confirm-payment',
    fileUpload(),
    checkUser,
    paymentController.confirmPayment
);

// Process owner payout
router.post(
    '/process-payout',
    fileUpload(),
    checkUser,
    paymentController.processOwnerPayout
);

// Cancel booking with refund
router.post(
    '/cancel-with-refund',
    fileUpload(),
    checkUser,
    paymentController.cancelBookingWithRefund
);

// Get payment details
router.get(
    '/details/:bookingId',
    checkUser,
    paymentController.getPaymentDetails
);

// Stripe Connect - Create onboarding link
router.post(
    '/stripe-connect/create-account',
    fileUpload(),
    checkUser,
    paymentController.createStripeConnectAccount
);

// Stripe Connect - Get account status
router.get(
    '/stripe-connect/account-status',
    checkUser,
    paymentController.getStripeConnectAccountStatus
);

// Stripe Connect - Generate account link for re-onboarding
router.post(
    '/stripe-connect/create-account-link',
    fileUpload(),
    checkUser,
    paymentController.createStripeConnectAccountLink
);

// Stripe Connect - Get account balance
router.get(
    '/stripe-connect/balance',
    checkUser,
    paymentController.getStripeConnectBalance
);

// Batch Payouts - Process all scheduled payouts
router.post(
    '/batch-payouts/process',
    fileUpload(),
    checkUser,
    paymentController.processBatchPayouts
);

// Batch Payouts - Get pending payouts (admin)
router.get(
    '/batch-payouts/pending',
    checkUser,
    paymentController.getPendingPayouts
);

// ============== SUBSCRIPTION ROUTES ==============

// Get subscription pricing
router.get(
    '/subscription/pricing',
    paymentController.getSubscriptionPricing
);

// Create subscription payment intent
router.post(
    '/subscription/create-payment',
    fileUpload(),
    checkUser,
    paymentController.createSubscriptionPayment
);

// Confirm subscription payment
router.post(
    '/subscription/confirm-payment',
    fileUpload(),
    checkUser,
    paymentController.confirmSubscriptionPayment
);

// Get user's subscription status
router.get(
    '/subscription/status',
    checkUser,
    paymentController.getSubscriptionStatus
);

// Cancel subscription (will stop auto-renewal at end of period)
router.post(
    '/subscription/cancel',
    fileUpload(),
    checkUser,
    paymentController.cancelSubscription
);

// Reactivate canceled subscription (resume auto-renewal)
router.post(
    '/subscription/reactivate',
    fileUpload(),
    checkUser,
    paymentController.reactivateSubscription
);

module.exports = router;
