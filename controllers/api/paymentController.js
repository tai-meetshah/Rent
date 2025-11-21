// controllers/api/paymentController.js
const stripe = require('../../config/stripe');
const Payment = require('../../models/paymentModel');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const AdminCommission = require('../../models/AdminCommission');
const User = require('../../models/userModel');
const createError = require('http-errors');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const userNotificationModel = require('../../models/userNotificationModel');

// Calculate cancellation charges based on time before booking
const calculateCancellationCharges = (booking, product) => {
    if (
        !product.oCancellationCharges ||
        product.oCancellationCharges.length === 0
    ) {
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
        const rentalPrice = Number(product.price || 0);
        const depositAmount = product.deposit
            ? Number(product.depositAmount || 0)
            : 0;

        // Total amount = rental price + deposit
        const totalAmount = rentalPrice + depositAmount;

        if (!totalAmount || totalAmount <= 0) {
            return next(createError.BadRequest('Invalid payment amount.'));
        }

        // Get active commission settings
        const commissionSettings = await getActiveCommission();

        // Commission is calculated ONLY on rental price, NOT on deposit
        const commissionAmount = calculateCommission(
            rentalPrice,
            commissionSettings
        );

        // Owner receives: rental price - commission (deposit is held separately)
        const ownerPayoutAmount = rentalPrice - commissionAmount;

        // Create payment intent with Stripe (in AUD)
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmount * 100), // Convert to cents
            currency: 'aud',
            metadata: {
                bookingId: booking._id.toString(),
                renterId: booking.user._id.toString(),
                ownerId: product.user.toString(),
                productId: product._id.toString(),
                rentalAmount: rentalPrice.toString(),
                depositAmount: depositAmount.toString(),
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
            depositAmount: depositAmount,
            rentalAmount: rentalPrice,
            commissionType: commissionSettings.commissionType,
            commissionPercentage:
                commissionSettings.commissionType === 'percentage'
                    ? commissionSettings.percentage
                    : null,
            commissionFixedAmount:
                commissionSettings.commissionType === 'fixed'
                    ? commissionSettings.fixedAmount
                    : null,
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
            rentalAmount: rentalPrice,
            depositAmount: depositAmount,
            currency: 'AUD',
            commission: {
                type: commissionSettings.commissionType,
                amount: commissionAmount,
                percentage:
                    commissionSettings.commissionType === 'percentage'
                        ? commissionSettings.percentage
                        : null,
                fixedAmount:
                    commissionSettings.commissionType === 'fixed'
                        ? commissionSettings.fixedAmount
                        : null,
            },
            ownerPayoutAmount,
            message: `Total payment: AUD $${totalAmount.toFixed(
                2
            )} (Rental: $${rentalPrice.toFixed(
                2
            )} + Deposit: $${depositAmount.toFixed(
                2
            )}). Deposit will be refunded after return verification.`,
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

        const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
        );

        if (paymentIntent.status !== 'succeeded') {
            return next(createError.BadRequest('Payment not completed.'));
        }

        const payment = await Payment.findOne({
            stripePaymentIntentId: paymentIntentId,
        })
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
        payment.stripeChargeId = paymentIntent.latest_charge;

        await payment.save();

        // Update booking payment status
        const booking = payment.booking;
        booking.paymentStatus = 'paid';
        await booking.save();

        // Send notification to owner
        if (payment.owner && payment.owner.fcmToken) {
            await sendNotificationsToTokens(
                'Payment Received',
                `${
                    payment.renter.name
                } has paid AUD $${payment.totalAmount.toFixed(2)} for ${
                    payment.product.title
                }. Amount will be transferred after rental completion.`,
                [payment.owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [payment.owner._id],
                title: 'Payment Received',
                body: `${
                    payment.renter.name
                } has paid AUD $${payment.totalAmount.toFixed(2)} for ${
                    payment.product.title
                }. Amount will be transferred after rental completion.`,
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
            return next(
                createError.BadRequest('Return photos not yet verified.')
            );
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
        const owner = await require('../../models/userModel').findById(
            payment.owner
        );
        if (owner && owner.fcmToken) {
            const commissionInfo =
                payment.commissionType === 'fixed'
                    ? `Fixed commission: AUD $${payment.commissionFixedAmount.toFixed(
                          2
                      )}`
                    : `Commission (${
                          payment.commissionPercentage
                      }%): AUD $${payment.commissionAmount.toFixed(2)}`;

            await sendNotificationsToTokens(
                'Payout Processed',
                `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                    2
                )} has been processed. ${commissionInfo}`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Payout Processed',
                body: `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                    2
                )} has been processed. ${commissionInfo}`,
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
        const isOwner =
            booking.product.user.toString() === req.user.id.toString();

        if (!isRenter && !isOwner) {
            return next(
                createError.Forbidden('Unauthorized to cancel this booking.')
            );
        }

        const product = booking.product;

        // Calculate cancellation charges using oCancellationCharges
        const { chargeAmount, chargePercentage } = calculateCancellationCharges(
            booking,
            product
        );

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
                        cancellationReason:
                            cancellationReason || 'No reason provided',
                    },
                });

                payment.refundAmount = refundAmount;
                payment.cancellationCharges = chargeAmount;
                payment.cancellationChargesPercentage = chargePercentage;
                payment.stripeRefundId = refund.id;
                payment.refundReason = cancellationReason;
                payment.refundedAt = new Date();
                payment.paymentStatus =
                    chargeAmount > 0 ? 'partially_refunded' : 'refunded';
                await payment.save();
            } catch (stripeError) {
                console.error('Stripe refund error:', stripeError);
                return next(
                    createError.BadRequest(
                        `Failed to process refund: ${stripeError.message}`
                    )
                );
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
                message = `Your booking has been cancelled. Cancellation charges: AUD $${chargeAmount.toFixed(
                    2
                )} (${chargePercentage}%). Refund amount: AUD $${refundAmount.toFixed(
                    2
                )} will be processed in 5-10 business days.`;
            } else if (refundAmount > 0) {
                message = `Your booking has been cancelled. Full refund of AUD $${refundAmount.toFixed(
                    2
                )} will be processed in 5-10 business days.`;
            } else {
                message = `Your booking has been cancelled. Cancellation charges of AUD $${chargeAmount.toFixed(
                    2
                )} (${chargePercentage}%) applied. No refund available.`;
            }

            await sendNotificationsToTokens('Booking Cancelled', message, [
                booking.user.fcmToken,
            ]);
            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title: 'Booking Cancelled',
                body: message,
            });
        }

        // Send notification to owner
        const owner = await require('../../models/userModel').findById(
            product.user
        );
        if (owner && owner.fcmToken) {
            await sendNotificationsToTokens(
                'Booking Cancelled',
                `Booking for ${product.title} has been cancelled by ${
                    cancelledBy === 'renter' ? 'the customer' : 'you'
                }. ${
                    chargeAmount > 0
                        ? `Cancellation charges: AUD $${chargeAmount.toFixed(
                              2
                          )}`
                        : ''
                }`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Booking Cancelled',
                body: `Booking for ${product.title} has been cancelled by ${
                    cancelledBy === 'renter' ? 'the customer' : 'you'
                }. ${
                    chargeAmount > 0
                        ? `Cancellation charges: AUD $${chargeAmount.toFixed(
                              2
                          )}`
                        : ''
                }`,
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
        const isRenter =
            payment.renter._id.toString() === req.user.id.toString();
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

            // **Handle the refund.updated event** for deposit refunds
            case 'refund.updated':
                const refund = event.data.object;
                console.log('Refund status updated:', refund.id);

                // Check if the refund status is "succeeded"
                if (refund.status === 'succeeded') {
                    console.log('Refund succeeded:', refund.id);

                    const bookingId = refund.metadata.bookingId; // Assuming you stored the booking ID in metadata
                    const paymentId = refund.metadata.paymentId; // You can store paymentId in metadata too if needed

                    // Find the relevant payment and update the status
                    const payment = await Payment.findById(paymentId);
                    if (payment) {
                        payment.depositRefunded = true;
                        payment.depositRefundedAt = new Date();
                        await payment.save();
                        console.log(
                            `Refund for booking ${bookingId} processed successfully.`
                        );

                        // Update the booking status, mark as refunded, etc.
                        const booking = await Booking.findById(bookingId);
                        if (booking) {
                            booking.refundStatus = 'refund_completed'; // Change this to whatever makes sense in your system
                            await booking.save();
                        }

                        // Notify renter about refund
                        const renter = await User.findById(booking.user);
                        if (renter && renter.fcmToken) {
                            await sendNotificationsToTokens(
                                'Deposit Refunded',
                                `Your deposit for the booking of ${booking.product.title} has been refunded.`,
                                [renter.fcmToken]
                            );
                            await userNotificationModel.create({
                                sentTo: [renter._id],
                                title: 'Deposit Refunded',
                                body: `Your deposit for the booking of ${booking.product.title} has been refunded.`,
                            });
                        }
                    }
                } else if (refund.status === 'failed') {
                    console.log('Refund failed:', refund.id);
                    // Handle refund failure (e.g., notify user, retry, etc.)
                }
                break;

            case 'charge.refunded':
                const chargeRefund = event.data.object;
                console.log('Charge refunded:', chargeRefund.id);
                break;

            default:
                console.log(`Unhandled event type ${event.type}`);
        }
    } catch (error) {
        console.error('Error handling webhook:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }

    // Acknowledge receipt of the event
    res.json({ received: true });
};

exports.processOwnerPayout = async (req, res, next) => {
    try {
        const { bookingId } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate('product')
            .populate({
                path: 'payment',
                populate: {
                    path: 'renter',
                    select: 'name email fcmToken',
                },
            });

        if (!booking) {
            return next(createError.NotFound('Booking not found.'));
        }

        // Check if all return photos are verified
        if (!booking.allReturnPhotosVerify) {
            return next(
                createError.BadRequest('Return photos not yet verified.')
            );
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

        // STEP 1: Refund deposit to renter
        let depositRefunded = false;
        if (payment.depositAmount > 0) {
            try {
                const depositRefund = await stripe.refunds.create({
                    charge: payment.stripeChargeId,
                    amount: Math.round(payment.depositAmount * 100), // Deposit amount in cents
                    reason: 'requested_by_customer',
                    metadata: {
                        bookingId: booking._id.toString(),
                        paymentId: payment._id.toString(),
                        refundType: 'deposit',
                    },
                });

                payment.depositRefundId = depositRefund.id;
                payment.depositRefundedAt = new Date();
                depositRefunded = true;

                // Send notification to renter about deposit refund
                if (payment.renter && payment.renter.fcmToken) {
                    await sendNotificationsToTokens(
                        'Deposit Refunded',
                        `Your deposit of AUD $${payment.depositAmount.toFixed(
                            2
                        )} for ${
                            booking.product.title
                        } has been refunded. It will appear in your account within 5-10 business days.`,
                        [payment.renter.fcmToken]
                    );
                    await userNotificationModel.create({
                        sentTo: [payment.renter._id],
                        title: 'Deposit Refunded',
                        body: `Your deposit of AUD $${payment.depositAmount.toFixed(
                            2
                        )} for ${
                            booking.product.title
                        } has been refunded. It will appear in your account within 5-10 business days.`,
                    });
                }
            } catch (refundError) {
                console.error('Error refunding deposit:', refundError);
                return next(
                    createError.BadRequest(
                        `Failed to refund deposit: ${refundError.message}`
                    )
                );
            }
        }

        // STEP 2: Transfer rental amount to owner (minus commission)
        // In production, transfer to owner's Stripe Connect account
        // For now, mark as processed

        // Uncomment for production with Stripe Connect:
        /*
        const transfer = await stripe.transfers.create({
            amount: Math.round(payment.ownerPayoutAmount * 100),
            currency: 'aud',
            destination: ownerStripeAccountId, // Get from owner's user record
            metadata: {
                bookingId: booking._id.toString(),
                paymentId: payment._id.toString(),
            },
        });
        payment.stripeTransferId = transfer.id;
        */

        payment.payoutStatus = 'paid';
        payment.payoutAt = new Date();
        await payment.save();

        // STEP 3: Update booking status to completed
        booking.status = 'completed';
        await booking.save();

        // STEP 4: Send notification to owner
        const owner = await require('../../models/userModel').findById(
            payment.owner
        );
        if (owner && owner.fcmToken) {
            const commissionInfo =
                payment.commissionType === 'fixed'
                    ? `Fixed commission: AUD $${payment.commissionFixedAmount.toFixed(
                          2
                      )}`
                    : `Commission (${
                          payment.commissionPercentage
                      }%): AUD $${payment.commissionAmount.toFixed(2)}`;

            await sendNotificationsToTokens(
                'Payout Processed',
                `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                    2
                )} for ${
                    booking.product.title
                } has been processed. ${commissionInfo}. The deposit of AUD $${payment.depositAmount.toFixed(
                    2
                )} has been refunded to the renter.`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Payout Processed',
                body: `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                    2
                )} for ${
                    booking.product.title
                } has been processed. ${commissionInfo}. The deposit of AUD $${payment.depositAmount.toFixed(
                    2
                )} has been refunded to the renter.`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Payout and deposit refund processed successfully.',
            payment,
            depositRefunded,
            depositAmount: payment.depositAmount,
            ownerPayoutAmount: payment.ownerPayoutAmount,
        });
    } catch (error) {
        console.error('Error processing payout:', error);
        next(error);
    }
};

// Create Stripe Connect account and generate onboarding link
exports.createStripeConnectAccount = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        // Check if user already has a Stripe Connect account
        if (user.stripeConnectAccountId) {
            console.log(
                'user.stripeConnectAccountId: ',
                user.stripeConnectAccountId
            );

            const accountExists = await stripe.accounts.retrieve(
                user.stripeConnectAccountId
            );
            console.log('Stripe Account Retrieve:', accountExists);

            // Account exists, generate new account link for re-onboarding
            const accountLink = await stripe.accountLinks.create({
                account: user.stripeConnectAccountId,
                refresh_url: `${process.env.FRONTEND_URL}/settings/payment?refresh=true`,
                return_url: `${process.env.FRONTEND_URL}/settings/payment?success=true`,
                type: 'account_onboarding',
            });

            return res.status(200).json({
                success: true,
                message: 'Account link generated.',
                url: accountLink.url,
                accountId: user.stripeConnectAccountId,
            });
        }

        // Create new Stripe Connect Express account
        const account = await stripe.accounts.create({
            type: 'express',
            country: user.country === 'Australia' ? 'AU' : 'US', // Default to AU or US
            email: user.email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
            business_type: 'individual',
            metadata: {
                userId: user._id.toString(),
            },
        });

        // Save account ID to user
        user.stripeConnectAccountId = account.id;
        user.stripeAccountType = 'express';
        user.stripeAccountStatus = 'pending';
        await user.save();

        // Generate account onboarding link
        const accountLink = await stripe.accountLinks.create({
            account: account.id,
            refresh_url: `${process.env.FRONTEND_URL}/settings/payment?refresh=true`,
            return_url: `${process.env.FRONTEND_URL}/settings/payment?success=true`,
            type: 'account_onboarding',
        });

        res.status(201).json({
            success: true,
            message:
                'Stripe Connect account created. Please complete onboarding.',
            url: accountLink.url,
            accountId: account.id,
        });
    } catch (error) {
        console.error('Error creating Stripe Connect account:', error);
        next(error);
    }
};

// Get Stripe Connect account status
exports.getStripeConnectAccountStatus = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        if (!user.stripeConnectAccountId) {
            return res.status(200).json({
                success: true,
                connected: false,
                status: 'not_started',
                message: 'No Stripe account connected.',
            });
        }

        // Retrieve account details from Stripe
        const account = await stripe.accounts.retrieve(
            user.stripeConnectAccountId
        );

        // Update user record with latest status
        user.stripeChargesEnabled = account.charges_enabled;
        user.stripePayoutsEnabled = account.payouts_enabled;
        user.stripeDetailsSubmitted = account.details_submitted;
        user.stripeOnboardingComplete =
            account.details_submitted && account.charges_enabled;

        if (account.details_submitted && account.charges_enabled) {
            user.stripeAccountStatus = 'verified';
        } else if (account.details_submitted) {
            user.stripeAccountStatus = 'pending';
        } else {
            user.stripeAccountStatus = 'pending';
        }

        await user.save();

        res.status(200).json({
            success: true,
            connected: true,
            accountId: account.id,
            status: user.stripeAccountStatus,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            requirements: {
                currentlyDue: account.requirements?.currently_due || [],
                errors: account.requirements?.errors || [],
                pendingVerification:
                    account.requirements?.pending_verification || [],
            },
            onboardingComplete: user.stripeOnboardingComplete,
        });
    } catch (error) {
        console.error('Error fetching Stripe Connect account status:', error);
        next(error);
    }
};

// Generate new account link for re-onboarding or updating details
exports.createStripeConnectAccountLink = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        if (!user.stripeConnectAccountId) {
            return next(
                createError.BadRequest(
                    'No Stripe Connect account found. Please create one first.'
                )
            );
        }

        // Generate account link
        const accountLink = await stripe.accountLinks.create({
            account: user.stripeConnectAccountId,
            refresh_url: `${process.env.FRONTEND_URL}/settings/payment?refresh=true`,
            return_url: `${process.env.FRONTEND_URL}/settings/payment?success=true`,
            type: 'account_onboarding',
        });

        res.status(200).json({
            success: true,
            message: 'Account link generated.',
            url: accountLink.url,
        });
    } catch (error) {
        console.error('Error creating account link:', error);
        next(error);
    }
};

// Get Stripe Connect account balance
exports.getStripeConnectBalance = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        if (!user.stripeConnectAccountId) {
            return next(
                createError.BadRequest('No Stripe Connect account found.')
            );
        }

        // Get balance from Stripe Connect account
        const balance = await stripe.balance.retrieve({
            stripeAccount: user.stripeConnectAccountId,
        });

        // Get pending balance
        const pendingBalance =
            balance.pending.reduce((sum, bal) => sum + bal.amount, 0) / 100;
        const availableBalance =
            balance.available.reduce((sum, bal) => sum + bal.amount, 0) / 100;

        res.status(200).json({
            success: true,
            balance: {
                available: availableBalance,
                pending: pendingBalance,
                currency: balance.available[0]?.currency || 'aud',
            },
        });
    } catch (error) {
        console.error('Error fetching balance:', error);
        next(error);
    }
};

// Webhook handler for Stripe Connect account events
exports.stripeConnectWebhook = async (req, res) => {
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

    try {
        switch (event.type) {
            case 'account.updated':
                const account = event.data.object;
                console.log('Account updated:', account.id);

                // Find user by Stripe account ID
                const user = await User.findOne({
                    stripeConnectAccountId: account.id,
                });
                if (user) {
                    user.stripeChargesEnabled = account.charges_enabled;
                    user.stripePayoutsEnabled = account.payouts_enabled;
                    user.stripeDetailsSubmitted = account.details_submitted;
                    user.stripeOnboardingComplete =
                        account.details_submitted && account.charges_enabled;

                    if (account.details_submitted && account.charges_enabled) {
                        user.stripeAccountStatus = 'verified';
                    } else if (account.details_submitted) {
                        user.stripeAccountStatus = 'pending';
                    }

                    await user.save();

                    // Send notification if account is verified
                    if (
                        user.stripeAccountStatus === 'verified' &&
                        user.fcmToken
                    ) {
                        await sendNotificationsToTokens(
                            'Payment Account Verified',
                            'Your payment account has been verified. You can now receive payouts from your rentals!',
                            [user.fcmToken]
                        );
                        await userNotificationModel.create({
                            sentTo: [user._id],
                            title: 'Payment Account Verified',
                            body: 'Your payment account has been verified. You can now receive payouts from your rentals!',
                        });
                    }
                }
                break;

            case 'account.external_account.created':
                console.log('External account added:', event.data.object.id);
                break;

            case 'account.external_account.deleted':
                console.log('External account removed:', event.data.object.id);
                break;

            default:
                console.log(
                    `Unhandled Stripe Connect event type: ${event.type}`
                );
        }
    } catch (error) {
        console.error('Error handling Stripe Connect webhook:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }

    res.json({ received: true });
};

// ============== BATCH PAYOUT PROCESSING ==============

// Process all scheduled payouts that are eligible
exports.processBatchPayouts = async (req, res, next) => {
    try {
        const now = new Date();

        // Find all payments that are:
        // 1. Scheduled for payout
        // 2. Payout date has passed
        // 3. Not already paid
        const eligiblePayments = await Payment.find({
            payoutStatus: 'scheduled',
            scheduledPayoutDate: { $lte: now },
        })
            .populate(
                'owner',
                'name email fcmToken stripeConnectAccountId stripePayoutsEnabled'
            )
            .populate('renter', 'name email')
            .populate('product', 'title')
            .populate('booking');

        console.log(
            `Found ${eligiblePayments.length} eligible payouts to process`
        );

        const results = {
            total: eligiblePayments.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            details: [],
        };

        // Group payments by owner to batch transfers
        const paymentsByOwner = {};
        for (const payment of eligiblePayments) {
            const ownerId = payment.owner._id.toString();
            if (!paymentsByOwner[ownerId]) {
                paymentsByOwner[ownerId] = [];
            }
            paymentsByOwner[ownerId].push(payment);
        }

        // Process each owner's payouts
        for (const [ownerId, payments] of Object.entries(paymentsByOwner)) {
            const owner = payments[0].owner;

            // Check if owner has valid Stripe Connect account
            if (!owner.stripeConnectAccountId) {
                console.error(`Owner ${ownerId} has no Stripe Connect account`);

                for (const payment of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'No Stripe Connect account',
                    });

                    // Notify owner to set up account
                    if (owner.fcmToken) {
                        await sendNotificationsToTokens(
                            'Action Required: Connect Payment Account',
                            `You have pending payouts totaling AUD $${payments
                                .reduce(
                                    (sum, p) => sum + p.ownerPayoutAmount,
                                    0
                                )
                                .toFixed(
                                    2
                                )}. Please connect your Stripe account to receive payments.`,
                            [owner.fcmToken]
                        );
                    }
                }
                continue;
            }

            if (!owner.stripePayoutsEnabled) {
                console.error(
                    `Owner ${ownerId} Stripe account not enabled for payouts`
                );

                for (const payment of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'Stripe account not verified',
                    });
                }
                continue;
            }

            // Calculate total payout for this owner
            const totalPayout = payments.reduce(
                (sum, p) => sum + p.ownerPayoutAmount,
                0
            );

            // Create a single transfer for all eligible payouts
            try {
                const transfer = await stripe.transfers.create({
                    amount: Math.round(totalPayout * 100),
                    currency: 'aud',
                    destination: owner.stripeConnectAccountId,
                    metadata: {
                        ownerId: ownerId,
                        paymentIds: payments
                            .map(p => p._id.toString())
                            .join(','),
                        paymentCount: payments.length.toString(),
                        batchDate: now.toISOString(),
                    },
                    description: `Batch payout for ${payments.length} rental${
                        payments.length > 1 ? 's' : ''
                    }`,
                });

                console.log(
                    `Transfer successful for owner ${ownerId}:`,
                    transfer.id,
                    'Amount:',
                    totalPayout
                );

                // Update all payments for this owner
                for (const payment of payments) {
                    payment.stripeTransferId = transfer.id;
                    payment.payoutStatus = 'paid';
                    payment.payoutAt = now;
                    await payment.save();

                    results.successful++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'success',
                        transferId: transfer.id,
                    });
                }

                // Send notification to owner
                if (owner.fcmToken) {
                    const bookingDetails = payments
                        .map(
                            p =>
                                `${
                                    p.product.title
                                }: AUD $${p.ownerPayoutAmount.toFixed(2)}`
                        )
                        .join(', ');

                    await sendNotificationsToTokens(
                        'Payout Processed',
                        `Your payout of AUD $${totalPayout.toFixed(2)} for ${
                            payments.length
                        } rental${
                            payments.length > 1 ? 's' : ''
                        } has been transferred to your account. ${bookingDetails}`,
                        [owner.fcmToken]
                    );

                    await userNotificationModel.create({
                        sentTo: [owner._id],
                        title: 'Payout Processed',
                        body: `Your payout of AUD $${totalPayout.toFixed(
                            2
                        )} for ${payments.length} rental${
                            payments.length > 1 ? 's' : ''
                        } has been transferred to your account.`,
                    });
                }
            } catch (transferError) {
                console.error(
                    `Error transferring to owner ${ownerId}:`,
                    transferError
                );

                for (const payment of payments) {
                    payment.payoutStatus = 'failed';
                    await payment.save();

                    results.failed++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'failed',
                        error: transferError.message,
                    });
                }

                // Notify owner of failure
                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Payout Failed',
                        `There was an issue processing your payout. Please contact support or check your payment account settings.`,
                        [owner.fcmToken]
                    );
                }
            }
        }

        res.status(200).json({
            success: true,
            message: `Batch payout processing complete. ${results.successful} successful, ${results.failed} failed, ${results.skipped} skipped.`,
            results,
        });
    } catch (error) {
        console.error('Error processing batch payouts:', error);
        next(error);
    }
};

// Get pending scheduled payouts (for admin dashboard)
exports.getPendingPayouts = async (req, res, next) => {
    try {
        const now = new Date();

        const pendingPayouts = await Payment.find({
            payoutStatus: 'scheduled',
        })
            .populate(
                'owner',
                'name email stripeConnectAccountId stripePayoutsEnabled'
            )
            .populate('renter', 'name email')
            .populate('product', 'title')
            .populate('booking')
            .sort('scheduledPayoutDate');

        // Categorize by status
        const categorized = {
            readyToProcess: [],
            awaitingDate: [],
            missingAccount: [],
        };

        for (const payout of pendingPayouts) {
            if (
                !payout.owner.stripeConnectAccountId ||
                !payout.owner.stripePayoutsEnabled
            ) {
                categorized.missingAccount.push(payout);
            } else if (payout.scheduledPayoutDate <= now) {
                categorized.readyToProcess.push(payout);
            } else {
                categorized.awaitingDate.push(payout);
            }
        }

        // Calculate totals
        const totals = {
            readyToProcess: categorized.readyToProcess.reduce(
                (sum, p) => sum + p.ownerPayoutAmount,
                0
            ),
            awaitingDate: categorized.awaitingDate.reduce(
                (sum, p) => sum + p.ownerPayoutAmount,
                0
            ),
            missingAccount: categorized.missingAccount.reduce(
                (sum, p) => sum + p.ownerPayoutAmount,
                0
            ),
        };

        res.status(200).json({
            success: true,
            summary: {
                total: pendingPayouts.length,
                readyToProcessCount: categorized.readyToProcess.length,
                awaitingDateCount: categorized.awaitingDate.length,
                missingAccountCount: categorized.missingAccount.length,
                totals,
            },
            payouts: categorized,
        });
    } catch (error) {
        console.error('Error fetching pending payouts:', error);
        next(error);
    }
};
