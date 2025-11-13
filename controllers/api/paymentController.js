// controllers/api/paymentController.js
const stripe = require('../../config/stripe');
const Payment = require('../../models/paymentModel');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const AdminCommission = require('../../models/adminCommissionModel');
const createError = require('http-errors');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const userNotificationModel = require('../../models/userNotificationModel');

// Calculate cancellation charges based on time before booking
const calculateCancellationCharges = (booking, product) => {
    if (!product.oCancellationCharges || product.oCancellationCharges.length === 0) {
        return { chargeAmount: 0, chargePercentage: 0 };
    }

    const now = new Date();
    const bookingStartDate = new Date(booking.bookedDates[0].date);
    const hoursDifference = (bookingStartDate - now) / (1000 * 60 * 60);

    // Sort cancellation charges by hoursBefore in descending order
    const sortedCharges = [...product.oCancellationCharges]
        .filter(charge => charge.hoursBefore && charge.chargeAmount)
        .sort((a, b) => parseFloat(b.hoursBefore) - parseFloat(a.hoursBefore));

    // Find applicable cancellation charge
    for (const charge of sortedCharges) {
        if (hoursDifference <= parseFloat(charge.hoursBefore)) {
            const chargePercentage = parseFloat(charge.chargeAmount);
            const totalAmount = booking.totalPrice || booking.advancePayment;
            const chargeAmount = (totalAmount * chargePercentage) / 100;

            return { chargeAmount, chargePercentage };
        }
    }

    return { chargeAmount: 0, chargePercentage: 0 };
};

// Get current active commission settings
const getActiveCommission = async () => {
    const commission = await AdminCommission.findOne({ isActive: true });

    if (!commission) {
        // Return default if no commission is set
        return {
            commissionType: 'percentage',
            percentage: 10,
            fixedAmount: 0,
        };
    }

    return commission;
};

// Calculate commission amount
const calculateCommission = (totalAmount, commissionSettings) => {
    let commissionAmount = 0;

    if (commissionSettings.commissionType === 'fixed') {
        commissionAmount = parseFloat(commissionSettings.fixedAmount || 0);
    } else if (commissionSettings.commissionType === 'percentage') {
        const percentage = parseFloat(commissionSettings.percentage || 0);
        commissionAmount = (totalAmount * percentage) / 100;
    }

    return commissionAmount;
};

// Create payment intent
exports.createPaymentIntent = async (req, res, next) => {
    try {
        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate('product')
            .populate('user', 'name email');

        if (!booking) {
            return next(createError.NotFound('Booking not found.'));
        }

        if (booking.user._id.toString() !== req.user.id.toString()) {
            return next(createError.Forbidden('Unauthorized access.'));
        }

        const product = booking.product;
        const totalAmount = booking.totalPrice || booking.advancePayment;

        if (!totalAmount || totalAmount <= 0) {
            return next(createError.BadRequest('Invalid payment amount.'));
        }

        // Get active commission settings
        const commissionSettings = await getActiveCommission();
        const commissionAmount = calculateCommission(totalAmount, commissionSettings);
        const ownerPayoutAmount = totalAmount - commissionAmount;

        // Create payment intent with Stripe (in AUD)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100), // Convert to cents
            currency: 'aud', // Australian Dollar
            metadata: {
                bookingId: booking._id.toString(),
                renterId: booking.user._id.toString(),
                ownerId: product.user.toString(),
                productId: product._id.toString(),
            },
            description: `Rental payment for ${product.title}`,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        // Create payment record
        const payment = await Payment.create({
            booking: booking._id,
            renter: booking.user._id,
            owner: product.user,
            product: product._id,
            totalAmount,
            depositAmount: booking.depositAmount || 0,
            rentalAmount: totalAmount,
            commissionType: commissionSettings.commissionType,
            commissionPercentage: commissionSettings.commissionType === 'percentage' ? commissionSettings.percentage : null,
            commissionFixedAmount: commissionSettings.commissionType === 'fixed' ? commissionSettings.fixedAmount : null,
            commissionAmount,
            ownerPayoutAmount,
            currency: 'AUD',
            stripePaymentIntentId: paymentIntent.id,
            paymentStatus: 'pending',
        });

        // Update booking with payment reference
        booking.payment = payment._id;
        await booking.save();

        res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            amount: totalAmount,
            currency: 'AUD',
            commission: {
                type: commissionSettings.commissionType,
                amount: commissionAmount,
                percentage: commissionSettings.commissionType === 'percentage' ? commissionSettings.percentage : null,
                fixedAmount: commissionSettings.commissionType === 'fixed' ? commissionSettings.fixedAmount : null,
            },
            ownerPayoutAmount,
            payment,
        });
    } catch (error) {
        console.error('Error creating payment intent:', error);
        next(error);
    }
};

// Confirm payment after successful Stripe payment
exports.confirmPayment = async (req, res, next) => {
    try {
        const { paymentIntentId } = req.body;

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        if (paymentIntent.status !== 'succeeded') {
            return next(createError.BadRequest('Payment not completed.'));
        }

        const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntentId })
            .populate('booking')
            .populate('owner', 'name fcmToken')
            .populate('renter', 'name')
            .populate('product', 'title');

        if (!payment) {
            return next(createError.NotFound('Payment record not found.'));
        }

        // Update payment status
        payment.paymentStatus = 'paid';
        payment.paidAt = new Date();
        payment.stripeChargeId = paymentIntent.charges.data[0].id;
        await payment.save();

        // Update booking payment status
        const booking = payment.booking;
        booking.paymentStatus = 'paid';
        await booking.save();

        // Send notification to owner
        if (payment.owner && payment.owner.fcmToken) {
            await sendNotificationsToTokens(
                'Payment Received',
                `${payment.renter.name} has paid AUD $${payment.totalAmount.toFixed(2)} for ${payment.product.title}. Amount will be transferred after rental completion.`,
                [payment.owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [payment.owner._id],
                title: 'Payment Received',
                body: `${payment.renter.name} has paid AUD $${payment.totalAmount.toFixed(2)} for ${payment.product.title}. Amount will be transferred after rental completion.`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Payment confirmed successfully.',
            payment,
        });
    } catch (error) {
        console.error('Error confirming payment:', error);
        next(error);
    }
};

// Process payout to owner after return photos are verified
exports.processOwnerPayout = async (req, res, next) => {
    try {
        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate('product')
            .populate('payment');

        if (!booking) {
            return next(createError.NotFound('Booking not found.'));
        }

        // Check if all return photos are verified
        if (!booking.allReturnPhotosVerify) {
            return next(createError.BadRequest('Return photos not yet verified.'));
        }

        const payment = booking.payment;

        if (!payment) {
            return next(createError.NotFound('Payment record not found.'));
        }

        if (payment.paymentStatus !== 'paid') {
            return next(createError.BadRequest('Payment not completed.'));
        }

        if (payment.payoutStatus === 'paid') {
            return next(createError.BadRequest('Payout already processed.'));
        }

        // In production, you would transfer to owner's Stripe Connect account
        // For now, we'll just mark as processed
        // Example for Stripe Connect:
        const transfer = await stripe.transfers.create({
            amount: Math.round(payment.ownerPayoutAmount * 100),
            currency: 'aud',
            destination: ownerStripeAccountId,
            metadata: {
                bookingId: booking._id.toString(),
                paymentId: payment._id.toString(),
            },
        });

        payment.payoutStatus = 'paid';
        payment.payoutAt = new Date();
        // payment.stripeTransferId = transfer.id;
        await payment.save();

        // Update booking status to completed
        booking.status = 'completed';
        await booking.save();

        // Send notification to owner
        const owner = await require('../../models/userModel').findById(payment.owner);
        if (owner && owner.fcmToken) {
            const commissionInfo = payment.commissionType === 'fixed'
                ? `Fixed commission: AUD $${payment.commissionFixedAmount.toFixed(2)}`
                : `Commission (${payment.commissionPercentage}%): AUD $${payment.commissionAmount.toFixed(2)}`;

            await sendNotificationsToTokens(
                'Payout Processed',
                `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(2)} has been processed. ${commissionInfo}`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Payout Processed',
                body: `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(2)} has been processed. ${commissionInfo}`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Payout processed successfully.',
            payment,
        });
    } catch (error) {
        console.error('Error processing payout:', error);
        next(error);
    }
};

// Handle booking cancellation with refunds
exports.cancelBookingWithRefund = async (req, res, next) => {
    try {
        const { bookingId, cancelledBy, cancellationReason } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate('product')
            .populate('payment')
            .populate('user', 'name fcmToken');

        if (!booking) {
            return next(createError.NotFound('Booking not found.'));
        }

        // Verify authorization
        const isRenter = booking.user._id.toString() === req.user.id.toString();
        const isOwner = booking.product.user.toString() === req.user.id.toString();

        if (!isRenter && !isOwner) {
            return next(createError.Forbidden('Unauthorized to cancel this booking.'));
        }

        const product = booking.product;

        // Calculate cancellation charges using oCancellationCharges
        const { chargeAmount, chargePercentage } = calculateCancellationCharges(booking, product);

        const payment = booking.payment;

        if (!payment) {
            // No payment made yet, just cancel
            booking.status = 'cancelled';
            booking.cancellationReason = cancellationReason;
            booking.cancellationInitiatedBy = cancelledBy;
            booking.cancellationInitiatedAt = new Date();
            await booking.save();

            return res.status(200).json({
                success: true,
                message: 'Booking cancelled successfully.',
                refundAmount: 0,
                cancellationCharges: 0,
            });
        }

        // Calculate refund amount
        const totalPaid = payment.totalAmount;
        const refundAmount = Math.max(0, totalPaid - chargeAmount);

        // Process refund if payment was made
        if (payment.paymentStatus === 'paid' && refundAmount > 0) {
            try {
                const refund = await stripe.refunds.create({
                    charge: payment.stripeChargeId,
                    amount: Math.round(refundAmount * 100), // Convert to cents
                    reason: 'requested_by_customer',
                    metadata: {
                        bookingId: booking._id.toString(),
                        cancellationReason: cancellationReason || 'No reason provided',
                    },
                });

                payment.refundAmount = refundAmount;
                payment.cancellationCharges = chargeAmount;
                payment.cancellationChargesPercentage = chargePercentage;
                payment.stripeRefundId = refund.id;
                payment.refundReason = cancellationReason;
                payment.refundedAt = new Date();
                payment.paymentStatus = chargeAmount > 0 ? 'partially_refunded' : 'refunded';
                await payment.save();
            } catch (stripeError) {
                console.error('Stripe refund error:', stripeError);
                return next(createError.BadRequest(`Failed to process refund: ${stripeError.message}`));
            }
        } else if (payment.paymentStatus === 'paid' && refundAmount === 0) {
            // No refund, just update payment status
            payment.cancellationCharges = chargeAmount;
            payment.cancellationChargesPercentage = chargePercentage;
            payment.refundReason = cancellationReason;
            await payment.save();
        }

        // Update booking
        booking.status = 'cancelled';
        booking.cancellationReason = cancellationReason;
        booking.cancellationCharges = chargeAmount;
        booking.refundAmount = refundAmount;
        booking.cancellationInitiatedBy = cancelledBy;
        booking.cancellationInitiatedAt = new Date();
        await booking.save();

        // Send notification to renter
        if (booking.user && booking.user.fcmToken) {
            let message = '';
            if (refundAmount > 0 && chargeAmount > 0) {
                message = `Your booking has been cancelled. Cancellation charges: AUD $${chargeAmount.toFixed(2)} (${chargePercentage}%). Refund amount: AUD $${refundAmount.toFixed(2)} will be processed in 5-10 business days.`;
            } else if (refundAmount > 0) {
                message = `Your booking has been cancelled. Full refund of AUD $${refundAmount.toFixed(2)} will be processed in 5-10 business days.`;
            } else {
                message = `Your booking has been cancelled. Cancellation charges of AUD $${chargeAmount.toFixed(2)} (${chargePercentage}%) applied. No refund available.`;
            }

            await sendNotificationsToTokens(
                'Booking Cancelled',
                message,
                [booking.user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title: 'Booking Cancelled',
                body: message,
            });
        }

        // Send notification to owner
        const owner = await require('../../models/userModel').findById(product.user);
        if (owner && owner.fcmToken) {
            await sendNotificationsToTokens(
                'Booking Cancelled',
                `Booking for ${product.title} has been cancelled by ${cancelledBy === 'renter' ? 'the customer' : 'you'}. ${chargeAmount > 0 ? `Cancellation charges: AUD $${chargeAmount.toFixed(2)}` : ''}`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Booking Cancelled',
                body: `Booking for ${product.title} has been cancelled by ${cancelledBy === 'renter' ? 'the customer' : 'you'}. ${chargeAmount > 0 ? `Cancellation charges: AUD $${chargeAmount.toFixed(2)}` : ''}`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully.',
            refundAmount,
            cancellationCharges: chargeAmount,
            cancellationPercentage: chargePercentage,
            currency: 'AUD',
            booking,
        });
    } catch (error) {
        console.error('Error cancelling booking:', error);
        next(error);
    }
};

// Get payment details
exports.getPaymentDetails = async (req, res, next) => {
    try {
        const { bookingId } = req.params;

        const payment = await Payment.findOne({ booking: bookingId })
            .populate('booking')
            .populate('renter', 'name email photo')
            .populate('owner', 'name email photo')
            .populate('product', 'title images');

        if (!payment) {
            return next(createError.NotFound('Payment record not found.'));
        }

        // Verify authorization
        const isRenter = payment.renter._id.toString() === req.user.id.toString();
        const isOwner = payment.owner._id.toString() === req.user.id.toString();

        if (!isRenter && !isOwner) {
            return next(createError.Forbidden('Unauthorized access.'));
        }

        res.status(200).json({
            success: true,
            payment,
        });
    } catch (error) {
        console.error('Error fetching payment details:', error);
        next(error);
    }
};

// Get all payments for a user (as renter)
exports.getMyPayments = async (req, res, next) => {
    try {
        const payments = await Payment.find({ renter: req.user.id })
            .populate('booking')
            .populate('product', 'title images')
            .populate('owner', 'name email')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            data: payments,
        });
    } catch (error) {
        console.error('Error fetching payments:', error);
        next(error);
    }
};

// Get all payouts for a user (as owner)
exports.getMyPayouts = async (req, res, next) => {
    try {
        const payouts = await Payment.find({ owner: req.user.id })
            .populate('booking')
            .populate('product', 'title images')
            .populate('renter', 'name email')
            .sort('-createdAt');

        res.status(200).json({
            success: true,
            data: payouts,
        });
    } catch (error) {
        console.error('Error fetching payouts:', error);
        next(error);
    }
};

// Webhook handler for Stripe events
exports.stripeWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(
            req.body,
            sig,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                console.log('PaymentIntent succeeded:', paymentIntent.id);

                // Update payment status
                await Payment.findOneAndUpdate(
                    { stripePaymentIntentId: paymentIntent.id },
                    {
                        paymentStatus: 'paid',
                        paidAt: new Date(),
                    }
                );
                break;

            case 'payment_intent.payment_failed':
                const failedPayment = event.data.object;
                console.log('PaymentIntent failed:', failedPayment.id);

                // Update payment status
                await Payment.findOneAndUpdate(
                    { stripePaymentIntentId: failedPayment.id },
                    { paymentStatus: 'failed' }
                );
                break;

            case 'charge.refunded':
                const refund = event.data.object;
                console.log('Charge refunded:', refund.id);
                break;

            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error) {
        console.error('Error handling webhook:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }

    res.json({ received: true });
};