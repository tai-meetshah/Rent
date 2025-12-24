// controllers/api/paymentController.js
const stripe = require('../../config/stripe');
const Payment = require('../../models/paymentModel');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const AdminCommission = require('../../models/AdminCommission');
const User = require('../../models/userModel');
const Subscription = require('../../models/subscriptionModel');
const createError = require('http-errors');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const userNotificationModel = require('../../models/userNotificationModel');
const {
    getStripePaymentFees,
    getStripeRefundFees,
    getStripeTransferFees,
    createChargeBreakdown,
} = require('../../utils/stripeFeesCalculator');

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

// Calculate Stripe processing fees
// Stripe Australia charges: 1.75% + $0.30 AUD per transaction
const calculateStripeProcessingFee = amount => {
    const percentageFee = amount * 0.0175; // 1.75%
    const fixedFee = 0.3; // $0.30 AUD
    return percentageFee + fixedFee;
};

// Calculate Stripe transfer fees (for Connect transfers)
// Standard Connect accounts: No additional transfer fee
// Express/Custom accounts: May have additional fees
const calculateStripeTransferFee = (amount, accountType = 'standard') => {
    if (accountType === 'standard') {
        return 0; // No transfer fee for standard accounts
    }
    // For express/custom accounts, you might have different fees
    return 0;
};

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getDeliverySlabAmount(slabs, distanceKm) {
    if (!Array.isArray(slabs) || slabs.length === 0) return 0;

    // Try exact match first
    for (const slab of slabs) {
        if (distanceKm >= slab.from && distanceKm <= slab.to) {
            return Number(slab.amount || 0);
        }
    }

    // No exact match → use last slab
    const lastSlab = slabs[slabs.length - 1];
    if (distanceKm > lastSlab.to) {
        return Number(lastSlab.amount || 0);
    }

    return 0;
}

// Create payment intent
exports.createPaymentIntent = async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        const { latitude, longitude } = req.body;

        if (!latitude || !longitude) {
            return next(
                createError.BadRequest(
                    'User location required for delivery cost.'
                )
            );
        }

        const booking = await Booking.findById(bookingId)
            .populate('product')
            .populate('user', 'name email');

        if (!booking) {
            return next(createError.NotFound('Booking not found.'));
        }

        // if (booking.user._id.toString() !== req.user.id.toString()) {
        //     return next(createError.Forbidden('Unauthorized access.'));
        // }

        const product = booking.product;

        const userLat = Number(latitude);
        const userLng = Number(longitude);

        const ownerLat = Number(product.oCoordinates.coordinates[1]);
        const ownerLng = Number(product.oCoordinates.coordinates[0]);

        const distanceKm = calculateDistanceKm(
            userLat,
            userLng,
            ownerLat,
            ownerLng
        );

        let deliveryCharge = getDeliverySlabAmount(product.slabs, distanceKm);

        if (booking.deliveryType == 'self-pickup') {
            deliveryCharge = 0;
        }
        // Determine rental days
        let rentalDays = 1;
        if (
            Array.isArray(booking.bookedDates) &&
            booking.bookedDates.length > 0
        ) {
            rentalDays = booking.bookedDates.length;
        } else if (booking.startDate && booking.endDate) {
            try {
                const start = new Date(booking.startDate);
                const end = new Date(booking.endDate);
                const diffMs = Math.abs(end - start);
                const msPerDay = 1000 * 60 * 60 * 24;
                rentalDays = Math.max(1, Math.ceil(diffMs / msPerDay));
            } catch (err) {
                rentalDays = 1;
            }
        }

        // Base price per day
        const basePricePerDay = Number(product.price || 0);
        // Total rental amount for the booking (price * days)
        const rentalPrice = basePricePerDay * rentalDays;

        const depositAmount = product.deposit
            ? Number(product.depositAmount || 0)
            : 0;

        // Total amount = rental price (for all days) + deposit
        const totalAmount = rentalPrice + depositAmount + deliveryCharge;

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

        // Calculate Stripe fees
        const stripeProcessingFee = calculateStripeProcessingFee(totalAmount);
        const stripeTransferFee = calculateStripeTransferFee(rentalPrice);
        const stripeTotalFee = stripeProcessingFee + stripeTransferFee;

        // Owner receives: rental price - commission (deposit is held separately)
        const ownerPayoutAmount = rentalPrice - commissionAmount;

        // Net owner payout after Stripe fees (if platform doesn't absorb fees)
        // Option 1: Deduct from owner's payout
        // const netOwnerPayout = ownerPayoutAmount - stripeTotalFee;

        // Option 2: Platform absorbs Stripe fees (recommended)
        const netOwnerPayout = ownerPayoutAmount;

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
                rentalDays: rentalDays.toString(),
                depositAmount: depositAmount.toString(),
            },
            description: `Rental payment for ${product.title}`,
            automatic_payment_methods: {
                enabled: true,
            },
        });
        // console.log('paymentIntent: ', JSON.stringify(paymentIntent, null, 2));

        // Create payment record
        const payment = await Payment.create({
            booking: booking._id,
            renter: booking.user._id,
            owner: product.user,
            product: product._id,
            totalAmount,
            depositAmount: depositAmount,
            rentalAmount: rentalPrice,
            deliveryCharge: deliveryCharge,
            rentalDays,
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
            stripeProcessingFee,
            stripeTransferFee,
            stripeTotalFee,
            netOwnerPayout,
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
            fees: {
                stripeProcessingFee,
                stripeTransferFee,
                stripeTotalFee,
            },
            ownerPayoutAmount,
            netOwnerPayout,
            payoutBreakdown: {
                rentalAmount: rentalPrice,
                adminCommission: commissionAmount,
                stripeFees: stripeTotalFee,
                finalPayout: netOwnerPayout,
            },
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

        const paymentFees = await getStripePaymentFees(paymentIntentId);
        console.log('-----------------------------------');

        console.log('paymentFees: ', paymentFees);
        console.log('-----------------------------------');
        // Update payment status
        payment.paymentStatus = 'paid';
        payment.paidAt = new Date();
        payment.stripeChargeId = paymentIntent.latest_charge;

        // Store actual stripe charges
        if (!payment.stripeCharges) {
            payment.stripeCharges = {
                chargesBreakdown: [],
            };
        }

        payment.stripeCharges.paymentProcessingFee = paymentFees.percentageFee;
        payment.stripeCharges.paymentFixedFee = paymentFees.fixedFee;
        payment.stripeCharges.paymentTotalFee = paymentFees.totalFee;
        payment.stripeCharges.totalStripeCharges = paymentFees.totalFee;

        // Add to breakdown with actual Stripe data
        payment.stripeCharges.chargesBreakdown.push(
            createChargeBreakdown(
                'payment',
                paymentFees.amount,
                paymentFees.totalFee,
                paymentFees.chargeId,
                `Payment processing fee (Balance Transaction: ${paymentFees.balanceTransactionId})`,
                paymentFees.feeDetails
            )
        );

        await payment.save();
        console.log('payment: ', payment);

        // Update booking payment status
        const booking = payment.booking;
        booking.paymentStatus = 'paid';
        await booking.save();

        if (req.user.fcmToken) {
            await sendNotificationsToTokens(
                `Booking request for ${payment.product.title}`,
                `Your booking request for ${payment.product.title} has been sent.`,
                [req.user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [req.user.id],
                title: `Booking request for ${payment.product.title}`,
                body: `Your booking request for ${payment.product.title} has been sent.`,
            });
        }

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
            // stripeCharges: {
            //     amount: paymentFees.amount,
            //     fee: paymentFees.totalFee,
            //     net: paymentFees.netAmount,
            //     breakdown: paymentFees.feeDetails
            // }
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
            process.env.STRIPE_WEBHOOK_SECRET2
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

                // Check if the refund status is "succeeded"
                if (refund.status === 'succeeded') {
                    const bookingId = refund.metadata.bookingId; // Assuming you stored the booking ID in metadata
                    const paymentId = refund.metadata.paymentId; // You can store paymentId in metadata too if needed

                    // Find the relevant payment and update the status
                    const payment = await Payment.findById(paymentId);
                    if (payment) {
                        payment.depositRefunded = true;
                        payment.depositRefundedAt = new Date();
                        await payment.save();

                        // Update the booking status, mark as refunded, etc.
                        const booking = await Booking.findById(bookingId);
                        if (booking) {
                            booking.refundStatus = 'refund_completed'; // Change this to whatever makes sense in your system
                            await booking.save();
                        }

                        // Notify renter about refund
                        const renter = await User.findById(booking.user);
                        const booking_populated = await Booking.findById(
                            bookingId
                        ).populate('product', 'title');
                        if (renter && renter.fcmToken && booking_populated) {
                            const refundAmount = (refund.amount / 100).toFixed(
                                2
                            );
                            const currency = refund.currency.toUpperCase();
                            await sendNotificationsToTokens(
                                'Deposit Refunded',
                                `${currency} $${refundAmount} for ${booking_populated.product.title} refunded. Arrives in 5–10 business days.`,
                                [renter.fcmToken]
                            );
                            await userNotificationModel.create({
                                sentTo: [renter._id],
                                title: 'Deposit Refunded',
                                body: `Your deposit of ${currency} $${refundAmount} for ${booking_populated.product.title} has been refunded. It will appear in your account within 5-10 business days.`,
                            });
                        }
                    }
                } else if (refund.status === 'failed') {
                    console.log(
                        `✗ Refund failed: ${refund.id} - Reason: ${
                            refund.failure_reason || 'Unknown'
                        }`
                    );

                    const bookingId = refund.metadata.bookingId;
                    const paymentId = refund.metadata.paymentId;
                    const failureReason =
                        refund.failure_reason || 'Unknown reason';

                    // Find the payment and booking
                    const payment = await Payment.findById(paymentId);
                    if (payment) {
                        const booking = await Booking.findById(
                            bookingId
                        ).populate('product', 'title');
                        const renter = await User.findById(booking.user);

                        if (renter && renter.fcmToken) {
                            await sendNotificationsToTokens(
                                'Refund Failed',
                                `Your refund for ${booking.product.title} has failed. Reason: ${failureReason}. Please contact support for assistance.`,
                                [renter.fcmToken]
                            );
                            await userNotificationModel.create({
                                sentTo: [renter._id],
                                title: 'Refund Failed',
                                body: `Your refund for ${booking.product.title} has failed. Reason: ${failureReason}. Please contact support for assistance.`,
                            });
                        }
                    }
                }
                break;

            case 'refund.created':
                const refundCreated = event.data.object;
                // Refund processing happens in refund.updated when status is 'succeeded'
                break;

            case 'charge.refunded':
                const chargeRefund = event.data.object;
                // Refund details are processed in refund.updated event
                break;

            case 'charge.refund.updated':
                console.log('Charge refund updated (acknowledged)');
                // This event is informational - refund status is tracked in refund.updated
                break;

            // Subscription webhook events for auto-renewal
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                const updatedSubscription = event.data.object;
                console.log('Subscription updated:', updatedSubscription.id);

                // Find subscription record
                const dbSubscription = await Subscription.findOne({
                    stripeSubscriptionId: updatedSubscription.id,
                });

                if (dbSubscription) {
                    // Update subscription status based on Stripe status
                    if (updatedSubscription.status === 'active') {
                        dbSubscription.isActive = true;
                        dbSubscription.paymentStatus = 'paid';

                        // Update expiration date to current period end
                        dbSubscription.expiresAt = new Date(
                            updatedSubscription.current_period_end * 1000
                        );

                        await dbSubscription.save();

                        // Update user subscription status
                        const user = await User.findById(dbSubscription.user);
                        if (user) {
                            user.hasSubscription = true;
                            user.subscriptionExpiresAt =
                                dbSubscription.expiresAt;
                            user.stripeSubscriptionId = updatedSubscription.id;
                            await user.save();
                        }
                    } else if (
                        updatedSubscription.status === 'canceled' ||
                        updatedSubscription.status === 'unpaid'
                    ) {
                        dbSubscription.isActive = false;
                        dbSubscription.cancelledAt = new Date();
                        await dbSubscription.save();

                        // Update user subscription status
                        const user = await User.findById(dbSubscription.user);
                        if (user) {
                            user.hasSubscription = false;
                            user.stripeSubscriptionId = null;
                            await user.save();
                        }
                    }
                }
                break;

            case 'customer.subscription.deleted':
                const deletedSubscription = event.data.object;
                console.log('Subscription deleted:', deletedSubscription.id);

                const canceledSub = await Subscription.findOne({
                    stripeSubscriptionId: deletedSubscription.id,
                });

                if (canceledSub) {
                    canceledSub.isActive = false;
                    canceledSub.cancelledAt = new Date();
                    canceledSub.autoRenew = false;
                    await canceledSub.save();

                    // Update user
                    const user = await User.findById(canceledSub.user);
                    if (user) {
                        user.hasSubscription = false;
                        user.stripeSubscriptionId = null;
                        await user.save();

                        // Send notification
                        if (user.fcmToken) {
                            await sendNotificationsToTokens(
                                'Subscription Canceled',
                                'Your subscription has been canceled. You will retain access until the end of your current billing period.',
                                [user.fcmToken]
                            );
                            await userNotificationModel.create({
                                sentTo: [user._id],
                                title: 'Subscription Canceled',
                                body: 'Your subscription has been canceled. You will retain access until the end of your current billing period.',
                            });
                        }
                    }
                }
                break;

            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                console.log('Invoice payment succeeded:', invoice.id);

                // Check if this is a subscription invoice
                if (invoice.subscription) {
                    const renewedSub = await Subscription.findOne({
                        stripeSubscriptionId: invoice.subscription,
                    }).populate('user', 'name email fcmToken');

                    if (renewedSub) {
                        // Get card details from the invoice's payment method
                        let cardDetails = {};
                        try {
                            if (invoice.charge) {
                                const charge = await stripe.charges.retrieve(
                                    invoice.charge
                                );
                                if (
                                    charge.payment_method_details &&
                                    charge.payment_method_details.card
                                ) {
                                    cardDetails = {
                                        cardLast4:
                                            charge.payment_method_details.card
                                                .last4,
                                        cardBrand:
                                            charge.payment_method_details.card
                                                .brand,
                                        cardExpMonth:
                                            charge.payment_method_details.card
                                                .exp_month,
                                        cardExpYear:
                                            charge.payment_method_details.card
                                                .exp_year,
                                    };
                                }
                            }
                        } catch (cardError) {
                            console.error(
                                'Error retrieving card details from charge:',
                                cardError
                            );
                        }

                        // Create a new subscription record for the renewal
                        const renewalSubscription = await Subscription.create({
                            user: renewedSub.user._id,
                            subscriptionType: renewedSub.subscriptionType,
                            amount: renewedSub.amount,
                            currency: renewedSub.currency,
                            adminAmount: renewedSub.adminAmount,
                            stripePaymentIntentId:
                                invoice.payment_intent ||
                                'auto_renewal_' + invoice.id,
                            stripeSubscriptionId:
                                renewedSub.stripeSubscriptionId,
                            stripePriceId: renewedSub.stripePriceId,
                            stripeCustomerId: renewedSub.stripeCustomerId,
                            stripeChargeId: invoice.charge,
                            paymentStatus: 'paid',
                            isActive: true,
                            autoRenew: true,
                            startDate: new Date(invoice.period_start * 1000),
                            expiresAt: new Date(invoice.period_end * 1000),
                            paidAt: new Date(),
                            ...cardDetails, // Add card details
                        });

                        // Update the original subscription's expiration
                        renewedSub.expiresAt = new Date(
                            invoice.period_end * 1000
                        );
                        renewedSub.isActive = true;
                        renewedSub.renewalAttempts = 0;
                        renewedSub.lastRenewalAttempt = new Date();
                        await renewedSub.save();

                        // Update user
                        const user = await User.findById(renewedSub.user._id);
                        if (user) {
                            user.hasSubscription = true;
                            user.subscriptionExpiresAt = new Date(
                                invoice.period_end * 1000
                            );
                            user.activeSubscriptionId = renewalSubscription._id;
                            await user.save();

                            // Send renewal notification
                            if (user.fcmToken) {
                                await sendNotificationsToTokens(
                                    'Subscription Renewed',
                                    `Your ${
                                        renewedSub.subscriptionType
                                    } subscription has been automatically renewed for AUD $${renewedSub.amount.toFixed(
                                        2
                                    )}. Your next billing date is ${new Date(
                                        invoice.period_end * 1000
                                    ).toLocaleDateString()}.`,
                                    [user.fcmToken]
                                );
                                await userNotificationModel.create({
                                    sentTo: [user._id],
                                    title: 'Subscription Renewed',
                                    body: `Your ${renewedSub.subscriptionType} subscription has been automatically renewed. Enjoy unlimited chat!`,
                                });
                            }
                        }
                    }
                }
                break;

            case 'invoice.payment_failed':
                const failedInvoice = event.data.object;
                console.log('Invoice payment failed:', failedInvoice.id);

                // Check if this is a subscription invoice
                if (failedInvoice.subscription) {
                    const failedSub = await Subscription.findOne({
                        stripeSubscriptionId: failedInvoice.subscription,
                    }).populate('user', 'name email fcmToken');

                    if (failedSub) {
                        failedSub.renewalAttempts =
                            (failedSub.renewalAttempts || 0) + 1;
                        failedSub.lastRenewalAttempt = new Date();
                        failedSub.lastRenewalError =
                            failedInvoice.last_finalization_error?.message ||
                            'Payment failed';
                        await failedSub.save();

                        // Notify user about failed payment
                        const user = failedSub.user;
                        if (user && user.fcmToken) {
                            await sendNotificationsToTokens(
                                'Subscription Payment Failed',
                                `Your subscription renewal payment failed. Please update your payment method to continue enjoying unlimited chat access. Attempt ${failedSub.renewalAttempts}/3.`,
                                [user.fcmToken]
                            );
                            await userNotificationModel.create({
                                sentTo: [user._id],
                                title: 'Subscription Payment Failed',
                                body: `Your subscription renewal payment failed. Please update your payment method to avoid service interruption.`,
                            });
                        }
                    }
                }
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
            country: 'AU', // Default to AU or US
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

        if (
            account.details_submitted &&
            account.charges_enabled &&
            account.payouts_enabled
        ) {
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
            process.env.STRIPE_WEBHOOK_SECRET1
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

            // Refund-related events - These are primarily handled in the main webhook
            // but we acknowledge them here to avoid "unhandled" logs
            case 'refund.created':
                console.log(
                    'Refund created:',
                    event.data.object.id,
                    '(handled in main webhook)'
                );
                break;

            case 'refund.updated':
                console.log(
                    'Refund updated:',
                    event.data.object.id,
                    '(handled in main webhook)'
                );
                break;

            case 'charge.refunded':
                const chargeRefunded = event.data.object;
                console.log(
                    'Charge refunded:',
                    chargeRefunded.id,
                    '(handled in main webhook)'
                );
                break;

            case 'charge.refund.updated':
                console.log(
                    'Charge refund updated (acknowledged in Connect webhook)'
                );
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

// ============== SUBSCRIPTION PAYMENTS ==============

// Define subscription pricing
const SUBSCRIPTION_PRICES = {
    // monthly: 9.99, // AUD $9.99 per month
    yearly: 10, // AUD $99.99 per year
    // lifetime: 299.99, // AUD $299.99 one-time
};

const SUBSCRIPTION_DURATIONS = {
    // monthly: 30, // 30 days
    yearly: 365, // 365 days
    // lifetime: 36500, // 100 years (effectively lifetime)
};

// Create subscription payment intent
exports.createSubscriptionPayment = async (req, res, next) => {
    try {
        const { subscriptionType = 'yearly' } = req.body;
        const userId = req.user.id;

        const commission = await AdminCommission.findOne();
        const adminAmount = commission.subscriptionAmount || 10;
        // Validate subscription type
        if (!['monthly', 'yearly', 'lifetime'].includes(subscriptionType)) {
            return next(createError.BadRequest('Invalid subscription type.'));
        }

        const user = await User.findById(userId);
        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        // Check if user already has active subscription
        if (user.hasSubscription && user.subscriptionExpiresAt > new Date()) {
            return next(
                createError.BadRequest(
                    'You already have an active subscription.'
                )
            );
        }

        const amount = adminAmount;
        // const adminAmount = amount; // 100% goes to admin

        // Create or retrieve Stripe Customer
        let customerId = user.stripeCustomerId;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    userId: userId,
                },
            });
            customerId = customer.id;
            user.stripeCustomerId = customerId;
            await user.save();
        }

        // if (subscriptionType === 'lifetime') {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(adminAmount * 100), // Convert to cents
            currency: 'aud',
            customer: customerId,
            metadata: {
                userId: userId,
                subscriptionType: subscriptionType,
                purpose: 'chat_subscription',
            },
            description: `Chat Subscription`,
            automatic_payment_methods: {
                enabled: true,
            },
        });

        // Create subscription record
        const subscription = await Subscription.create({
            user: userId,
            subscriptionType,
            amount,
            currency: 'AUD',
            adminAmount,
            stripePaymentIntentId: paymentIntent.id,
            stripeCustomerId: customerId,
            paymentStatus: 'pending',
            autoRenew: false,
        });

        return res.status(200).json({
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
            subscriptionId: subscription._id,
            amount,
            currency: 'AUD',
            // subscriptionType,
            // autoRenew: false,
            // message: `Subscription payment for ${subscriptionType} plan. Amount: AUD $${amount.toFixed(
            //     2
            // )}.`,
        });
        // }

        // For monthly/yearly, create Stripe Subscription with auto-renewal
        // First, create a price for the subscription
        // const interval = subscriptionType === 'monthly' ? 'month' : 'year';
        // const price = await stripe.prices.create({
        //     unit_amount: Math.round(amount * 100),
        //     currency: 'aud',
        //     recurring: {
        //         interval: interval,
        //     },
        //     product_data: {
        //         name: `Chat Subscription - ${
        //             subscriptionType.charAt(0).toUpperCase() +
        //             subscriptionType.slice(1)
        //         }`,
        //         description: 'Unlimited chat access with auto-renewal',
        //     },
        //     metadata: {
        //         subscriptionType: subscriptionType,
        //     },
        // });

        // Create Stripe Subscription
        // const stripeSubscription = await stripe.subscriptions.create({
        //     customer: customerId,
        //     items: [{ price: price.id }],
        //     payment_behavior: 'default_incomplete',
        //     payment_settings: {
        //         save_default_payment_method: 'on_subscription',
        //     },
        //     expand: ['latest_invoice.payment_intent'],
        //     metadata: {
        //         userId: userId,
        //         subscriptionType: subscriptionType,
        //         purpose: 'chat_subscription',
        //     },
        // });

        // const paymentIntent = stripeSubscription.latest_invoice.payment_intent;

        // Create subscription record in database
        // const subscription = await Subscription.create({
        //     user: userId,
        //     subscriptionType,
        //     amount,
        //     currency: 'AUD',
        //     adminAmount,
        //     stripePaymentIntentId: paymentIntent.id,
        //     stripeSubscriptionId: stripeSubscription.id,
        //     stripePriceId: price.id,
        //     stripeCustomerId: customerId,
        //     paymentStatus: 'pending',
        //     autoRenew: true,
        // });

        // res.status(200).json({
        //     success: true,
        //     clientSecret: paymentIntent.client_secret,
        //     paymentIntentId: paymentIntent.id,
        //     subscriptionId: subscription._id,
        //     stripeSubscriptionId: stripeSubscription.id,
        //     amount,
        //     currency: 'AUD',
        //     subscriptionType,
        //     autoRenew: true,
        //     message: `Subscription payment for ${subscriptionType} plan. Amount: AUD $${amount.toFixed(
        //         2
        //     )}. Auto-renews ${interval}ly.`,
        // });
    } catch (error) {
        console.error('Error creating subscription payment:', error);
        next(error);
    }
};

// Confirm subscription payment and activate subscription
exports.confirmSubscriptionPayment = async (req, res, next) => {
    try {
        const { paymentIntentId } = req.body;
        const userId = req.user.id;

        // Verify payment with Stripe
        const paymentIntent = await stripe.paymentIntents.retrieve(
            paymentIntentId
        );

        if (paymentIntent.status !== 'succeeded') {
            return next(createError.BadRequest('Payment not completed.'));
        }

        // Find subscription record
        const subscription = await Subscription.findOne({
            stripePaymentIntentId: paymentIntentId,
        }).populate('user', 'name email fcmToken');

        if (!subscription) {
            return next(createError.NotFound('Subscription record not found.'));
        }

        if (subscription.user._id.toString() !== userId) {
            return next(createError.Forbidden('Unauthorized access.'));
        }

        // Update subscription status
        subscription.paymentStatus = 'paid';
        subscription.isActive = true;
        subscription.paidAt = new Date();
        subscription.startDate = new Date();
        subscription.stripeChargeId = paymentIntent.latest_charge;

        // Retrieve and store card details from payment method
        try {
            if (paymentIntent.payment_method) {
                const paymentMethod = await stripe.paymentMethods.retrieve(
                    paymentIntent.payment_method
                );

                if (paymentMethod.card) {
                    subscription.cardLast4 = paymentMethod.card.last4;
                    subscription.cardBrand = paymentMethod.card.brand; // visa, mastercard, amex, etc.
                    subscription.cardExpMonth = paymentMethod.card.exp_month;
                    subscription.cardExpYear = paymentMethod.card.exp_year;
                }
            }
        } catch (cardError) {
            console.error(
                'Error retrieving payment method details:',
                cardError
            );
            // Continue even if we can't get card details
        }

        // Calculate expiration date
        const durationDays =
            SUBSCRIPTION_DURATIONS[subscription.subscriptionType];
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);
        subscription.expiresAt = expiresAt;

        await subscription.save();

        // Update user subscription status
        const user = await User.findById(userId);
        user.hasSubscription = true;
        user.subscriptionExpiresAt = expiresAt;
        user.subscriptionActivatedAt = new Date();
        user.activeSubscriptionId = subscription._id;
        // Store Stripe subscription ID if this is a recurring subscription
        if (subscription.stripeSubscriptionId) {
            user.stripeSubscriptionId = subscription.stripeSubscriptionId;
        }
        // No need to reset chattedWith array - subscribed users have unlimited chats
        user.lastChatReset = new Date();

        await user.save();

        // Send notification to user
        if (user.fcmToken) {
            const renewalInfo = subscription.autoRenew
                ? ` Your subscription will auto-renew on ${expiresAt.toLocaleDateString()}.`
                : '';
            await sendNotificationsToTokens(
                'Subscription Activated',
                `Your ${
                    subscription.subscriptionType
                } chat subscription has been activated! You now have unlimited chat access${
                    subscription.subscriptionType === 'lifetime'
                        ? ' for lifetime'
                        : ` until ${expiresAt.toLocaleDateString()}`
                }.${renewalInfo}`,
                [user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [userId],
                title: 'Subscription Activated',
                body: `Your ${subscription.subscriptionType} chat subscription has been activated! Enjoy unlimited chat.${renewalInfo}`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Subscription activated successfully.',
            subscription: {
                type: subscription.subscriptionType,
                startDate: subscription.startDate,
                expiresAt: subscription.expiresAt,
                isActive: subscription.isActive,
                amount: subscription.amount,
                autoRenew: subscription.autoRenew,
            },
        });
    } catch (error) {
        console.error('Error confirming subscription payment:', error);
        next(error);
    }
};

// Get user's subscription status
exports.getSubscriptionStatus = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId).select(
            'hasSubscription subscriptionExpiresAt subscriptionActivatedAt stripeSubscriptionId activeSubscriptionId'
        );

        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        // If user has a Stripe subscription, check its current status
        let stripeSubscriptionData = null;
        let willAutoRenew = false;
        // if (user.stripeSubscriptionId) {
        //     try {
        //         const stripeSubscription = await stripe.subscriptions.retrieve(
        //             user.stripeSubscriptionId
        //         );
        //         stripeSubscriptionData = {
        //             status: stripeSubscription.status,
        //             currentPeriodEnd: new Date(
        //                 stripeSubscription.current_period_end * 1000
        //             ),
        //             cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        //             canceledAt: stripeSubscription.canceled_at
        //                 ? new Date(stripeSubscription.canceled_at * 1000)
        //                 : null,
        //         };
        //         willAutoRenew =
        //             !stripeSubscription.cancel_at_period_end &&
        //             stripeSubscription.status === 'active';

        //         // Sync expiration date with Stripe
        //         if (stripeSubscription.status === 'active') {
        //             const newExpiresAt = new Date(
        //                 stripeSubscription.current_period_end * 1000
        //             );
        //             if (
        //                 !user.subscriptionExpiresAt ||
        //                 user.subscriptionExpiresAt.getTime() !==
        //                     newExpiresAt.getTime()
        //             ) {
        //                 user.subscriptionExpiresAt = newExpiresAt;
        //                 user.hasSubscription = true;
        //                 await user.save();
        //             }
        //         }
        //     } catch (stripeError) {
        //         console.error(
        //             'Error fetching Stripe subscription:',
        //             stripeError
        //         );
        //         // Continue with local data if Stripe fails
        //     }
        // }

        // Check if subscription has expired
        let isExpired = false;
        if (
            user.subscriptionExpiresAt &&
            user.subscriptionExpiresAt < new Date()
        ) {
            isExpired = true;
            // Auto-deactivate expired subscription
            if (user.hasSubscription) {
                user.hasSubscription = false;
                await user.save();
            }
        }

        // Get current active subscription
        const activeSubscription = user.activeSubscriptionId
            ? await Subscription.findById(user.activeSubscriptionId)
            : null;

        // Get subscription history
        const subscriptions = await Subscription.find({
            user: userId,
            paymentStatus: 'paid',
        })
            .sort('-createdAt')
            .limit(5);

        // Calculate remaining unique chats
        const uniqueChatsCount = user.chattedWith ? user.chattedWith.length : 0;
        const remainingChats = user.hasSubscription
            ? 'unlimited'
            : Math.max(0, 10 - uniqueChatsCount);

        res.status(200).json({
            success: true,
            subscription: {
                hasActiveSubscription: user.hasSubscription && !isExpired,
                expiresAt: user.subscriptionExpiresAt,
                activatedAt: user.subscriptionActivatedAt,
                isExpired,
                // autoRenew: willAutoRenew,
                type: activeSubscription
                    ? activeSubscription.subscriptionType
                    : null,
                amount: activeSubscription ? activeSubscription.amount : null,
                // Card details for display
                paymentMethod:
                    activeSubscription && activeSubscription.cardLast4
                        ? {
                              cardLast4: activeSubscription.cardLast4,
                              cardBrand: activeSubscription.cardBrand,
                              cardExpMonth: activeSubscription.cardExpMonth,
                              cardExpYear: activeSubscription.cardExpYear,
                              displayText: `${
                                  activeSubscription.cardBrand
                                      ? activeSubscription.cardBrand.toUpperCase()
                                      : 'Card'
                              } ••••${activeSubscription.cardLast4}`,
                          }
                        : null,
                stripeStatus: stripeSubscriptionData,
                uniqueChatsCount: uniqueChatsCount,
                remainingChats,
                unlimited: user.hasSubscription && !isExpired,
                description:
                    'Free users can chat with up to 10 different users (unlimited messages per user)',
            },
            // subscriptionHistory: subscriptions.map(sub => ({
            //     _id: sub._id,
            //     // subscriptionType: sub.subscriptionType,
            //     amount: sub.amount,
            //     startDate: sub.startDate,
            //     expiresAt: sub.expiresAt,
            //     isActive: sub.isActive,
            //     // autoRenew: sub.autoRenew,
            //     paidAt: sub.paidAt,
            //     // Include card details in history
            //     paymentMethod: sub.cardLast4
            //         ? {
            //               cardLast4: sub.cardLast4,
            //               cardBrand: sub.cardBrand,
            //               displayText: `${
            //                   sub.cardBrand
            //                       ? sub.cardBrand.toUpperCase()
            //                       : 'Card'
            //               } ••••${sub.cardLast4}`,
            //           }
            //         : null,
            // })),
        });
    } catch (error) {
        console.error('Error fetching subscription status:', error);
        next(error);
    }
};

// Get subscription pricing
exports.getSubscriptionPricing = async (req, res, next) => {
    try {
        const pricing = Object.entries(SUBSCRIPTION_PRICES).map(
            ([type, price]) => ({
                type,
                price,
                currency: 'AUD',
                duration: SUBSCRIPTION_DURATIONS[type],
                features: [
                    'Unlimited chat messages',
                    'No daily limits',
                    'Priority support',
                    type === 'lifetime'
                        ? 'One-time payment'
                        : `${
                              type.charAt(0).toUpperCase() + type.slice(1)
                          } billing`,
                ],
            })
        );

        res.status(200).json({
            success: true,
            pricing,
            // freePlan: {
            //     limit: 10,
            //     description:
            //         'Free users can chat with up to 10 different users (unlimited messages per conversation)',
            // },
        });
    } catch (error) {
        console.error('Error fetching subscription pricing:', error);
        next(error);
    }
};

// Cancel subscription
exports.cancelSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        // Check if user has an active Stripe subscription
        if (!user.stripeSubscriptionId) {
            return next(
                createError.BadRequest(
                    'No active auto-renewing subscription found.'
                )
            );
        }

        // Cancel the Stripe subscription
        const canceledSubscription = await stripe.subscriptions.update(
            user.stripeSubscriptionId,
            {
                cancel_at_period_end: true, // Cancel at end of billing period
            }
        );

        // Update database subscription record
        const dbSubscription = await Subscription.findOne({
            stripeSubscriptionId: user.stripeSubscriptionId,
            isActive: true,
        });

        if (dbSubscription) {
            dbSubscription.autoRenew = false;
            dbSubscription.cancelledAt = new Date();
            await dbSubscription.save();
        }

        // Don't immediately deactivate - user keeps access until period end
        // The webhook will handle final deactivation

        // Send notification
        if (user.fcmToken) {
            await sendNotificationsToTokens(
                'Subscription Canceled',
                `Your subscription has been canceled and will not auto-renew. You will retain access until ${new Date(
                    canceledSubscription.current_period_end * 1000
                ).toLocaleDateString()}.`,
                [user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [userId],
                title: 'Subscription Canceled',
                body: `Your subscription has been canceled. You'll retain access until the end of your current billing period.`,
            });
        }

        res.status(200).json({
            success: true,
            message:
                'Subscription canceled successfully. You will retain access until the end of your current billing period.',
            subscription: {
                canceledAt: new Date(),
                accessUntil: new Date(
                    canceledSubscription.current_period_end * 1000
                ),
                willAutoRenew: false,
            },
        });
    } catch (error) {
        console.error('Error canceling subscription:', error);
        next(error);
    }
};

// Reactivate canceled subscription
exports.reactivateSubscription = async (req, res, next) => {
    try {
        const userId = req.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return next(createError.NotFound('User not found.'));
        }

        if (!user.stripeSubscriptionId) {
            return next(
                createError.BadRequest('No subscription found to reactivate.')
            );
        }

        // Retrieve subscription from Stripe
        const stripeSubscription = await stripe.subscriptions.retrieve(
            user.stripeSubscriptionId
        );

        if (!stripeSubscription.cancel_at_period_end) {
            return next(
                createError.BadRequest(
                    'Subscription is already active and will auto-renew.'
                )
            );
        }

        // Reactivate the subscription
        const reactivatedSubscription = await stripe.subscriptions.update(
            user.stripeSubscriptionId,
            {
                cancel_at_period_end: false,
            }
        );

        // Update database subscription record
        const dbSubscription = await Subscription.findOne({
            stripeSubscriptionId: user.stripeSubscriptionId,
        });

        if (dbSubscription) {
            dbSubscription.autoRenew = true;
            dbSubscription.cancelledAt = null;
            await dbSubscription.save();
        }

        // Send notification
        if (user.fcmToken) {
            await sendNotificationsToTokens(
                'Subscription Reactivated',
                `Your subscription has been reactivated and will auto-renew on ${new Date(
                    reactivatedSubscription.current_period_end * 1000
                ).toLocaleDateString()}.`,
                [user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [userId],
                title: 'Subscription Reactivated',
                body: `Your subscription has been reactivated and will continue with auto-renewal.`,
            });
        }

        res.status(200).json({
            success: true,
            message: 'Subscription reactivated successfully.',
            subscription: {
                reactivatedAt: new Date(),
                nextBillingDate: new Date(
                    reactivatedSubscription.current_period_end * 1000
                ),
                willAutoRenew: true,
            },
        });
    } catch (error) {
        console.error('Error reactivating subscription:', error);
        next(error);
    }
};
