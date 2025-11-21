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

// Stripe webhook (no authentication)
router.post(
    '/webhook',
    express.raw({ type: 'application/json' }),
    paymentController.stripeWebhook
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

// Stripe Connect webhook (for account updates)
router.post(
    '/stripe-connect/webhook',
    express.raw({ type: 'application/json' }),
    paymentController.stripeConnectWebhook
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

module.exports = router;
