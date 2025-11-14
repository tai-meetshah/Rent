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

module.exports = router;
