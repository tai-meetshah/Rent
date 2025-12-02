const mongoose = require('mongoose');
const Booking = require('../../models/Booking');
const Product = require('../../models/product');
const Review = require('../../models/reviewModel');
const Payment = require('../../models/paymentModel');
const AdminCommission = require('../../models/AdminCommission');
const enquiryModel = require('../../models/enquiryModel');
const userNotificationModel = require('../../models/userNotificationModel');
const { sendNotificationsToTokens } = require('../../utils/sendNotification');
const stripe = require('../../config/stripe');

// Helpers
async function hasOverlappingBooking(productId, dates) {
    const justDates = (dates || []).map(d => new Date(d.date || d));
    if (!justDates.length) return false;
    const overlap = await Booking.findOne({
        product: productId,
        status: { $nin: ['cancelled', 'completed'] },
        'bookedDates.date': { $in: justDates },
    }).select('_id');
    return Boolean(overlap);
}

async function checkStockAvailabilityForDates(
    productId,
    requestedDates,
    totalStock
) {
    try {
        // Get all active bookings for this product that overlap with requested dates
        const overlappingBookings = await Booking.find({
            product: productId,
            status: { $in: ['pending', 'confirmed', 'ongoing'] },
            'bookedDates.date': { $in: requestedDates },
        }).select('bookedDates');

        // Count how many items are booked for each requested date
        const dateBookingCounts = {};
        requestedDates.forEach(date => {
            dateBookingCounts[date.toISOString().split('T')[0]] = 0;
        });

        // Count bookings for each date
        overlappingBookings.forEach(booking => {
            booking.bookedDates.forEach(dateObj => {
                if (dateObj.date) {
                    const dateString = new Date(dateObj.date)
                        .toISOString()
                        .split('T')[0];
                    if (dateBookingCounts.hasOwnProperty(dateString)) {
                        dateBookingCounts[dateString]++;
                    }
                }
            });
        });

        // Find the maximum number of bookings for any single date
        const maxBookedForAnyDate = Math.max(
            ...Object.values(dateBookingCounts)
        );
        const availableStock = Math.max(0, totalStock - maxBookedForAnyDate);

        return {
            available: availableStock > 0,
            availableStock: availableStock,
            bookedStock: maxBookedForAnyDate,
            dateBookingCounts: dateBookingCounts,
        };
    } catch (error) {
        console.error('Error checking stock availability:', error);
        return {
            available: false,
            availableStock: 0,
            bookedStock: totalStock,
            dateBookingCounts: {},
        };
    }
}

exports.checkAvailability = async (req, res, next) => {
    try {
        let { productId, dates } = req.body;
        // console.log('req.body: ', req.body);
        if (typeof dates === 'string') {
            try {
                dates = JSON.parse(dates);
            } catch (_) {}
        }
        // console.log('dates: ', dates);

        if (!productId || !Array.isArray(dates)) {
            return res.status(400).json({
                success: false,
                message: 'productId and dates[] are required',
            });
        }
        const product = await Product.findById(productId).select(
            '_id selectDate allDaysAvailable stockQuantity'
        );
        if (!product)
            return res
                .status(404)
                .json({ success: false, message: 'Product not found.' });

        const totalStock = parseInt(product.stockQuantity) || 0;
        if (totalStock <= 0) {
            return res.json({
                success: true,
                available: false,
                reason: 'Product is out of stock',
            });
        }

        // Check if requested dates are available in product's selectDate
        let datesAvailable = true;
        if (
            !product.allDaysAvailable &&
            product.selectDate &&
            product.selectDate.length > 0
        ) {
            const requestedDates = dates.map(d => new Date(d.date || d));
            const availableDates = product.selectDate.map(
                date => new Date(date)
            );

            // Check if all requested dates are in the available dates
            datesAvailable = requestedDates.every(requestedDate =>
                availableDates.some(
                    availableDate =>
                        requestedDate.toDateString() ===
                        availableDate.toDateString()
                )
            );
        }

        if (!datesAvailable) {
            return res.json({
                success: true,
                available: false,
                reason: 'Selected dates are not available for this product',
            });
        }

        // Check stock availability for the requested dates
        const requestedDates = dates.map(d => new Date(d.date || d));
        const stockAvailability = await checkStockAvailabilityForDates(
            productId,
            requestedDates,
            totalStock
        );

        if (!stockAvailability.available) {
            return res.json({
                success: true,
                available: false,
                reason: `Insufficient stock. Only ${stockAvailability.availableStock} items available for the selected dates.`,
                stockInfo: {
                    totalStock: totalStock,
                    availableStock: stockAvailability.availableStock,
                    bookedStock: stockAvailability.bookedStock,
                },
            });
        }

        const isOverlap = await hasOverlappingBooking(productId, dates);
        return res.json({
            success: true,
            available: !isOverlap,
            stockInfo: {
                totalStock: totalStock,
                availableStock: stockAvailability.availableStock,
                bookedStock: stockAvailability.bookedStock,
            },
        });
    } catch (error) {
        next(error);
    }
};

exports.createBooking = async (req, res, next) => {
    try {
        const {
            productId,
            deliveryType,
            pickupTime,
            advancePayment,
            totalPrice,
            notes,
        } = req.body;
        console.log(req.body);
        let { bookedDates, address } = req.body;
        // Accept bookedDates as JSON string or array
        if (typeof bookedDates === 'string') {
            try {
                bookedDates = JSON.parse(bookedDates);
            } catch (_) {}
        }
        if (!productId || !Array.isArray(bookedDates) || !deliveryType) {
            return res.status(400).json({
                success: false,
                message: 'Required: productId, bookedDates[], deliveryType',
            });
        }

        if (typeof address === 'string') {
            try {
                address = JSON.parse(address);
            } catch (_) {}
        }
        // if (!address || typeof address !== 'object') {
        //      address = {
        //           fullName: req.body.fullName,
        //           mobileNumber: req.body.mobileNumber,
        //           addressLine: req.body.addressLine,
        //           city: req.body.city,
        //           state: req.body.state,
        //           pincode: req.body.pincode,
        //           country: req.body.country,
        //      };
        // }

        const product = await Product.findById(productId).populate(
            'user',
            'name fcmToken'
        );
        // console.log('product: ', product);
        if (!product)
            return res
                .status(404)
                .json({ success: false, message: 'Product not found.' });

        const verificationImagePath = req.file
            ? `/${req.file.filename}`
            : undefined;

        let data = await Booking.create({
            product: productId,
            user: req.user.id,
            bookedDates,
            deliveryType,
            pickupTime,
            advancePayment: Number(advancePayment) || 0,
            // totalPrice: Number(totalPrice),
            status: 'pending',
            paymentStatus: 'unpaid',
            returnPhotos: [],
            verificationId: verificationImagePath,
            notes,
            address,
        });
        // console.log('data: ', data);

        // Send notification to seller about new booking
        // if (product.user) {
        //     await sendNotificationsToTokens(
        //         `New booking request for ${product.title}`,
        //         `You have received a new booking request from ${
        //             req.user.name || 'a customer'
        //         }.`,
        //         [product.user.fcmToken]
        //     );
        //     await userNotificationModel.create({
        //         sentTo: [product.user._id],
        //         title: `New booking request for ${product.title}`,
        //         body: `You have received a new booking request from ${
        //             req.user.name || 'a customer'
        //         }.`,
        //     });
        // }

        // if (req.user.fcmToken) {
        //     await sendNotificationsToTokens(
        //         `Booking request for ${product.title}`,
        //         `Your booking request for ${product.title} has been sent.`,
        //         [req.user.fcmToken]
        //     );
        //     await userNotificationModel.create({
        //         sentTo: [req.user.id],
        //         title: `Booking request for ${product.title}`,
        //         body: `Your booking request for ${product.title} has been sent.`,
        //     });
        // }
        res.status(201).json({
            success: true,
            message: 'Booking created successfully.',
            data: data._id,
        });
    } catch (error) {
        console.log(error);

        next(error);
    }
};

// {"fullName":"John Doe","mobileNumber":"1234567890","addressLine":"123 Street","city":"City","state":"State","pincode":"123456","country":"Country"}
exports.getMyBookings = async (req, res, next) => {
    try {
        const bookings = await Booking.find({
            user: req.user.id,
            status: { $in: ['pending', 'cancelled'] },
            paymentStatus: { $in: ['paid'] },
        })
            .sort('-createdAt')
            .populate({
                path: 'product',
                match: { isDeleted: false, isActive: true },
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' },
                ],
            })
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus',
            });
        const filteredBookings = bookings.filter(
            booking =>
                booking.product &&
                booking.product.isActive &&
                !booking.product.isDeleted
        );

        res.json({ success: true, data: filteredBookings });
    } catch (error) {
        next(error);
    }
};

exports.getSellerBookings = async (req, res, next) => {
    try {
        const sellerId = req.user.id; // Assumes auth middleware sets req.user

        const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

        const productIds = await Product.find({
            user: sellerObjectId,
            isDeleted: false,
            isActive: true,
        }).distinct('_id');

        const bookings = await Booking.find({
            status: { $in: ['pending', 'cancelled'] },
            paymentStatus: { $in: ['paid'] },
            product: { $in: productIds },
        })
            .populate([
                {
                    path: 'product',
                    populate: [
                        { path: 'category', select: 'name' },
                        { path: 'subcategory', select: 'name' },
                    ],
                },
            ])
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus commissionType commissionPercentage commissionFixedAmount commissionAmount ownerPayoutAmount',
            })
            .sort({ createdAt: -1 });

        // const filteredBookings = bookings.filter(b => b.product !== null);

        res.json({
            success: true,
            data: bookings,
        });
    } catch (error) {
        next(error);
    }
};

exports.getBookingById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const booking = await Booking.findOne({
            _id: id,
            user: req.user.id,
        }).populate('product', '-__v -isDeleted');
        if (!booking)
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        res.json({ success: true, data: booking });
    } catch (error) {
        next(error);
    }
};

exports.cancelBooking = async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        const booking = await Booking.findOne({
            _id: bookingId,
            user: req.user.id,
        })
            .populate({
                path: 'product',
                populate: {
                    path: 'user',
                    select: 'name email fcmToken',
                }, // populate product.user
            })
            .populate('user', 'name email');

        if (!booking)
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });

        const product = booking.product;

        // Compute cancellation charge based on product.oCancellationCharges
        let chargeAmount = 0;
        let chargePercentage = 0;

        if (
            product &&
            product.oCancellationCharges &&
            product.oCancellationCharges.length > 0
        ) {
            const now = new Date();
            const bookingStartDate =
                booking.bookedDates && booking.bookedDates.length > 0
                    ? new Date(booking.bookedDates[0].date)
                    : booking.startDate
                    ? new Date(booking.startDate)
                    : null;

            if (bookingStartDate) {
                const hoursDifference =
                    (bookingStartDate - now) / (1000 * 60 * 60);

                const sortedCharges = [...product.oCancellationCharges]
                    .filter(
                        c =>
                            c.hoursBefore &&
                            c.chargeAmount !== undefined &&
                            c.chargeAmount !== null
                    )
                    .sort(
                        (a, b) =>
                            parseFloat(b.hoursBefore) -
                            parseFloat(a.hoursBefore)
                    );

                for (const c of sortedCharges) {
                    if (hoursDifference <= parseFloat(c.hoursBefore)) {
                        chargePercentage = parseFloat(c.chargeAmount) || 0;
                        break;
                    }
                }
            }
        }

        // Determine base amount to calculate cancellation charge (prefer booking.totalPrice, then advancePayment, then payment.totalAmount)
        // let baseAmount = booking.totalPrice || booking.advancePayment || 0;
        let baseAmount;
        const existingPayment = await Payment.findOne({ booking: booking._id });
        if ((!baseAmount || baseAmount === 0) && existingPayment) {
            baseAmount = existingPayment.rentalAmount || 0;
        }

        if (chargePercentage > 0 && baseAmount > 0) {
            // chargeAmount = (baseAmount * chargePercentage) / 100;
            chargeAmount = baseAmount - chargePercentage;
        }

        // If there's no payment, just cancel and record charges on booking
        if (!existingPayment) {
            booking.status = 'cancelled';
            booking.cancellationCharges = chargeAmount;
            booking.cancellationPercentage = chargePercentage;
            booking.cancellationInitiatedBy = req.user.id;
            booking.cancellationInitiatedAt = new Date();
            await booking.save();

            // Notify vendor
            if (booking.product && booking.product.user) {
                await sendNotificationsToTokens(
                    `Booking cancelled for ${booking.product.title}`,
                    `Booking has been cancelled by ${
                        booking.user.name || 'the customer'
                    }.`,
                    [booking.product.user.fcmToken]
                );
                await userNotificationModel.create({
                    sentTo: [booking.product.user._id],
                    title: `Booking cancelled for ${booking.product.title}`,
                    body: `Booking has been cancelled by ${
                        booking.user.name || 'the customer'
                    }.`,
                });
            }

            return res.json({
                success: true,
                message: 'Booking cancelled.',
                cancellationCharges: chargeAmount,
            });
        }

        // If payment exists, process refund and allocate cancellation charge
        let refundAmount = Math.max(
            0,
            existingPayment.totalAmount - chargeAmount
        );

        try {
            if (existingPayment.paymentStatus === 'paid' && refundAmount > 0) {
                const refund = await stripe.refunds.create({
                    charge: existingPayment.stripeChargeId,
                    amount: Math.round(refundAmount * 100),
                    reason: 'requested_by_customer',
                    metadata: {
                        bookingId: booking._id.toString(),
                        paymentId: existingPayment._id.toString(),
                        cancellation: true,
                    },
                });

                existingPayment.refundAmount = refundAmount;
                existingPayment.cancellationCharges = chargeAmount;
                existingPayment.cancellationChargesPercentage =
                    chargePercentage;
                existingPayment.stripeRefundId = refund.id;
                existingPayment.refundReason = 'Cancellation';
                existingPayment.refundedAt = new Date();
                existingPayment.paymentStatus =
                    chargeAmount > 0 ? 'partially_refunded' : 'refunded';
            } else if (
                existingPayment.paymentStatus === 'paid' &&
                refundAmount === 0
            ) {
                // No refund, but record cancellation
                existingPayment.cancellationCharges = chargeAmount;
                existingPayment.cancellationChargesPercentage =
                    chargePercentage;
            }

            // Allocate cancellation charge between admin and vendor using AdminCommission
            const commissionRecord = await AdminCommission.findOne({
                isActive: true,
            });
            let adminCommissionAmount = 0;
            if (commissionRecord) {
                if (commissionRecord.commissionType === 'fixed') {
                    adminCommissionAmount = parseFloat(
                        commissionRecord.fixedAmount || 0
                    );
                } else {
                    const percent = parseFloat(
                        commissionRecord.percentage || 0
                    );
                    adminCommissionAmount = (chargeAmount * percent) / 100;
                }
            }

            // Ensure adminCommissionAmount does not exceed chargeAmount
            adminCommissionAmount = Math.min(
                adminCommissionAmount,
                chargeAmount
            );
            const vendorShare = chargeAmount - adminCommissionAmount;

            existingPayment.cancellationAdminCommission = adminCommissionAmount;
            existingPayment.cancellationVendorAmount = vendorShare;

            await existingPayment.save();
        } catch (stripeError) {
            console.error(
                'Stripe refund error during cancellation:',
                stripeError
            );
            return res.status(400).json({
                success: false,
                message: `Failed to process refund: ${stripeError.message}`,
            });
        }

        // Update booking
        booking.status = 'cancelled';
        booking.cancellationCharges = chargeAmount;
        booking.refundAmount = refundAmount;
        booking.cancellationInitiatedBy = req.user.id;
        booking.cancellationInitiatedAt = new Date();
        await booking.save();

        // Notify renter
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

        // Notify owner (vendor)
        const owner = await require('../../models/userModel').findById(
            product.user
        );
        if (owner && owner.fcmToken) {
            const adminInfo = `Admin commission from cancellation: AUD $${
                existingPayment.cancellationAdminCommission
                    ? existingPayment.cancellationAdminCommission.toFixed(2)
                    : '0.00'
            }`;
            await sendNotificationsToTokens(
                'Booking Cancelled',
                `Booking for ${product.title} has been cancelled. ${
                    chargeAmount > 0
                        ? `Cancellation charges: AUD $${chargeAmount.toFixed(
                              2
                          )}. ${adminInfo}`
                        : ''
                }`,
                [owner.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [owner._id],
                title: 'Booking Cancelled',
                body: `Booking for ${product.title} has been cancelled. ${
                    chargeAmount > 0
                        ? `Cancellation charges: AUD $${chargeAmount.toFixed(
                              2
                          )}. ${adminInfo}`
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
            cancellationAdminCommission:
                existingPayment.cancellationAdminCommission,
            cancellationVendorAmount: existingPayment.cancellationVendorAmount,
            booking,
        });
    } catch (error) {
        next(error);
    }
};

// Only seller can update booking status
exports.updateStatus = async (req, res, next) => {
    try {
        const { bookingId, status } = req.body;
        const allowed = ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'];

        if (!allowed.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status'
            });
        }

        const booking = await Booking.findOne({ _id: bookingId })
            .populate('product')
            .populate('user', 'name email fcmToken');

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found.'
            });
        }

        const isSeller = booking.product?.user?.toString() === req.user.id.toString();
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only seller can update status.'
            });
        }

        /** -----------------------------------------
         *  SELLER CANCELS → FULL REFUND (rental + deposit)
         * ------------------------------------------ */
        let refundAmount = 0;
        let payment = await Payment.findOne({ booking: booking._id });

        if (status === 'cancelled' && payment && payment.paymentStatus === 'paid') {
            try {
                // Full refund = rentalAmount + depositAmount
                refundAmount = Number(payment.rentalAmount || 0) + Number(payment.depositAmount || 0);

                const refund = await stripe.refunds.create({
                    charge: payment.stripeChargeId,
                    amount: Math.round(refundAmount * 100),
                    reason: 'requested_by_customer',
                    metadata: {
                        type: 'seller_cancellation',
                        bookingId: booking._id.toString(),
                        paymentId: payment._id.toString()
                    }
                });

                // Update payment record
                payment.refundAmount = refundAmount;
                payment.stripeRefundId = refund.id;
                payment.refundedAt = new Date();
                payment.paymentStatus = 'refunded';
                payment.cancellationCharges = 0;
                payment.cancellationAdminCommission = 0;
                payment.cancellationVendorAmount = 0;
                await payment.save();

            } catch (err) {
                console.error("Stripe refund error:", err);
                return res.status(400).json({
                    success: false,
                    message: `Refund failed: ${err.message}`
                });
            }
        }

        // Update booking status
        booking.status = status;
        if (status === 'cancelled') {
            booking.cancellationInitiatedBy = req.user.id;
            booking.cancellationInitiatedAt = new Date();
            booking.cancellationCharges = 0;
            booking.refundAmount = refundAmount;
        }
        await booking.save();

        /** ---------------------
         * SEND NOTIFICATIONS
         * -------------------- */

        if (booking.user && booking.user.fcmToken) {
            let bodyMsg = '';

            if (status === 'cancelled') {
                bodyMsg = `Your booking for ${booking.product.title} was cancelled by the seller.
A full refund of AUD $${refundAmount.toFixed(2)} will be processed in 5–10 business days.`;
            } else {
                bodyMsg = `Your booking for ${booking.product.title} status updated to: ${status}.`;
            }

            await sendNotificationsToTokens(
                `Booking Status Updated - ${booking.product.title}`,
                bodyMsg,
                [booking.user.fcmToken]
            );

            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title: `Booking Status Updated - ${booking.product.title}`,
                body: bodyMsg,
            });
        }

        return res.json({
            success: true,
            message: 'Status updated.',
            booking,
            refundAmount: refundAmount || 0,
        });

    } catch (error) {
        next(error);
    }
};

exports.updatePaymentStatus = async (req, res, next) => {
    try {
        const { bookingId, paymentStatus } = req.body;
        const allowed = ['unpaid', 'paid', 'refunded'];
        if (!allowed.includes(paymentStatus))
            return res
                .status(400)
                .json({ success: false, message: 'Invalid paymentStatus' });
        const booking = await Booking.findOne({
            _id: bookingId,
            user: req.user.id,
        });
        if (!booking)
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        booking.paymentStatus = paymentStatus;
        await booking.save();
        res.json({ success: true, message: 'Payment status updated.' });
    } catch (error) {
        next(error);
    }
};

exports.uploadReturnPhotos = async (req, res, next) => {
    try {
        const { id } = req.params; // bookingId
        const booking = await Booking.findOne({
            _id: id,
            user: req.user.id,
        })
            .populate({
                path: 'product',
                populate: {
                    path: 'user',
                    select: 'name email fcmToken',
                },
            })
            .populate('user', 'name email');
        if (!booking)
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        const files = req.files || [];
        const photos = files.map(f => ({
            url: `/${f.filename}`,
            status: 'pending',
            uploadedAt: new Date(),
        }));
        booking.returnPhotos.push(...photos);
        await booking.save();

        if (booking.product?.user) {
            const title = `Return photos uploaded for ${booking.product.title}`;
            const body = `Customer ${
                booking.user?.name || 'User'
            } has uploaded return photos.`;

            // Send push notification
            if (booking.product.user.fcmToken) {
                await sendNotificationsToTokens(title, body, [
                    booking.product.user.fcmToken,
                ]);
            }

            await userNotificationModel.create({
                sentTo: [booking.product.user._id],
                title,
                body,
            });
        }
        res.status(201).json({
            success: true,
            message: 'Photos uploaded.',
            photos: booking.returnPhotos,
        });
    } catch (error) {
        console.log('error: ', error);
        next(error);
    }
};

exports.reviewReturnPhoto = async (req, res, next) => {
    try {
        const { bookingId, photoId, action, rejectionReason } = req.body;

        const booking = await Booking.findById(bookingId)
            .populate({
                path: 'product',
                populate: { path: 'user', select: 'name email fcmToken' },
            })
            .populate('user', 'name email fcmToken')
            .populate({
                path: 'payment',
                populate: {
                    path: 'renter owner',
                    select: 'name email fcmToken',
                },
            });

        if (!booking)
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });

        const photo = (booking.returnPhotos || []).id(photoId);
        if (!photo)
            return res
                .status(404)
                .json({ success: false, message: 'Photo not found.' });

        if (action === 'approve') {
            photo.status = 'approved';
            photo.rejectionReason = undefined;
        } else if (action === 'reject') {
            photo.status = 'rejected';
            photo.rejectionReason = rejectionReason || 'Not approved';
        } else {
            return res
                .status(400)
                .json({ success: false, message: 'Invalid action' });
        }

        const allPhotos = booking.returnPhotos || [];
        const allApproved =
            allPhotos.length > 0 &&
            allPhotos.every(p => p.status === 'approved');

        if (allApproved) {
            booking.allReturnPhotosVerify = true;
        } else {
            booking.allReturnPhotosVerify = false;
        }

        await booking.save();

        // Send notification to renter about photo review
        if (booking.user?.fcmToken) {
            const title =
                action === 'approve'
                    ? 'Return photo approved'
                    : 'Return photo rejected';
            const body =
                action === 'approve'
                    ? `One of your return photos for ${
                          booking.product?.title
                      } has been approved.${
                          allApproved
                              ? 'Your deposit will be refunded shortly.'
                              : ''
                      }`
                    : `One of your return photos for ${booking.product?.title} was rejected. Reason: ${photo.rejectionReason}`;

            await sendNotificationsToTokens(title, body, [
                booking.user.fcmToken,
            ]);
            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title,
                body,
            });
        }

        // If all photos approved, automatically process deposit refund and payout
        if (allApproved && booking.payment) {
            try {
                const payment = booking.payment;
                if (!payment.stripeChargeId) {
                    console.error(
                        'Missing stripeChargeId for payment:',
                        payment._id
                    );
                    return res.json({
                        success: true,
                        message:
                            'Photo reviewed. Payment needs to be completed before payout.',
                        allPhotosVerified: allApproved,
                    });
                }

                if (payment.paymentStatus !== 'paid') {
                    console.error(
                        'Payment not completed. Status:',
                        payment.paymentStatus
                    );
                    return res.json({
                        success: true,
                        message:
                            'Photo reviewed. Payment needs to be completed before payout.',
                        allPhotosVerified: allApproved,
                    });
                }

                if (payment.payoutStatus === 'paid') {
                    return res.json({
                        success: true,
                        message: 'Photo reviewed. Payout already processed.',
                        allPhotosVerified: allApproved,
                    });
                }

                // STEP 1: Refund deposit to renter
                let depositRefunded = false;
                if (payment.depositAmount > 0 && !payment.depositRefundedAt) {
                    try {
                        const depositRefund = await stripe.refunds.create({
                            charge: payment.stripeChargeId,
                            amount: Math.round(payment.depositAmount * 100),
                            reason: 'requested_by_customer',
                            metadata: {
                                bookingId: booking._id.toString(),
                                paymentId: payment._id.toString(),
                                refundType: 'deposit',
                            },
                        });
                        console.log(
                            `Deposit refund created: ${
                                depositRefund.id
                            } - AUD $${(depositRefund.amount / 100).toFixed(2)}`
                        );

                        payment.depositRefundId = depositRefund.id;
                        payment.depositRefundedAt = new Date();
                        depositRefunded = true;
                        await payment.save();

                        // Note: Deposit refund notification will be sent by the webhook handler
                        // when Stripe confirms the refund has succeeded (refund.updated event)
                        console.log(
                            `Deposit refund initiated: ${
                                depositRefund.id
                            } for booking ${booking._id.toString()}`
                        );
                    } catch (refundError) {
                        console.error('Error refunding deposit:', refundError);
                        return res.status(400).json({
                            success: false,
                            message: `Failed to refund deposit: ${refundError.message}`,
                        });
                    }
                }

                // STEP 2: Schedule payout for 15 days from now
                const owner = await require('../../models/userModel').findById(
                    payment.owner
                );

                if (!owner) {
                    console.error('Owner not found:', payment.owner);
                    return res.status(400).json({
                        success: false,
                        message: 'Owner not found.',
                    });
                }

                // Check if owner has a verified Stripe Connect account
                if (!owner.stripeConnectAccountId) {
                    console.log(
                        `⚠ Owner ${owner._id} has no Stripe Connect account. Payout scheduled for 15 days - they have time to connect.`
                    );
                    // Don't fail, just log - they have 15 days to set up
                }

                // Calculate payout date: 15 days from now
                const scheduledPayoutDate = new Date();
                scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 15);

                payment.payoutStatus = 'scheduled';
                payment.scheduledPayoutDate = scheduledPayoutDate;
                payment.payoutEligibleDate = scheduledPayoutDate;
                await payment.save();

                console.log(
                    `✓ Payout scheduled: AUD $${payment.ownerPayoutAmount.toFixed(
                        2
                    )} for owner ${
                        owner._id
                    } on ${scheduledPayoutDate.toISOString()}`
                );

                // STEP 3: Update booking to completed
                booking.status = 'completed';
                await booking.save();

                // STEP 4: Notify owner about scheduled payout
                if (owner && owner.fcmToken) {
                    const commissionInfo =
                        payment.commissionType === 'fixed'
                            ? `Fixed commission: AUD $${payment.commissionFixedAmount.toFixed(
                                  2
                              )}`
                            : `Commission (${
                                  payment.commissionPercentage
                              }%): AUD $${payment.commissionAmount.toFixed(2)}`;

                    const payoutDateStr =
                        scheduledPayoutDate.toLocaleDateString('en-AU', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        });

                    await sendNotificationsToTokens(
                        'Payout Scheduled',
                        `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                            2
                        )} for ${
                            booking.product.title
                        } has been scheduled for ${payoutDateStr}. ${commissionInfo}.${
                            !owner.stripeConnectAccountId
                                ? ' Please connect your Stripe account to receive payouts.'
                                : ''
                        }`,
                        [owner.fcmToken]
                    );
                    await userNotificationModel.create({
                        sentTo: [owner._id],
                        title: 'Payout Scheduled',
                        body: `Your payout of AUD $${payment.ownerPayoutAmount.toFixed(
                            2
                        )} for ${
                            booking.product.title
                        } has been scheduled for ${payoutDateStr}. ${commissionInfo}.${
                            !owner.stripeConnectAccountId
                                ? ' Please connect your Stripe account to receive payouts.'
                                : ''
                        }`,
                    });
                }

                return res.status(200).json({
                    success: true,
                    message:
                        'Photo reviewed. Deposit refunded and payout scheduled.',
                    allPhotosVerified: allApproved,
                    depositRefunded,
                    depositAmount: payment.depositAmount,
                    ownerPayoutAmount: payment.ownerPayoutAmount,
                    payoutScheduledFor: scheduledPayoutDate,
                    payoutStatus: 'scheduled',
                });
            } catch (payoutError) {
                console.error('Error auto-processing payout:', payoutError);
                return res.status(500).json({
                    success: false,
                    message: `Error processing payout: ${payoutError.message}`,
                });
            }
        }

        res.json({
            success: true,
            message: 'Photo reviewed.',
            allPhotosVerified: allApproved,
        });
    } catch (error) {
        console.error('Error in reviewReturnPhoto:', error);
        next(error);
    }
};

exports.reuploadRejectedPhoto = async (req, res, next) => {
    try {
        const { id } = req.params; // bookingId
        const { photoId } = req.body; // ID of the rejected photo to replace

        if (!photoId) {
            return res
                .status(400)
                .json({ success: false, message: 'Photo ID is required.' });
        }

        const booking = await Booking.findOne({
            _id: id,
            user: req.user.id,
        }).populate({
            path: 'product',
            populate: { path: 'user', select: 'name fcmToken' },
        });
        if (!booking) {
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        }

        const photo = (booking.returnPhotos || []).id(photoId);
        if (!photo) {
            return res
                .status(404)
                .json({ success: false, message: 'Photo not found.' });
        }

        if (photo.status !== 'rejected') {
            return res.status(400).json({
                success: false,
                message: 'Only rejected photos can be re-uploaded.',
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'New photo file is required.',
            });
        }

        photo.url = `/${req.file.filename}`;
        photo.status = 'pending';
        photo.rejectionReason = undefined;
        photo.uploadedAt = new Date();

        // Since photo is now pending, set allReturnPhotosVerify to false
        booking.allReturnPhotosVerify = false;

        await booking.save();

        if (booking.product?.user?.fcmToken) {
            const vendor = booking.product.user;
            const title = `Photo re-uploaded for ${booking.product.title}`;
            const body = `${
                booking.user.name || 'A customer'
            } has re-uploaded a rejected photo.`;

            // Push notification
            await sendNotificationsToTokens(title, body, [vendor.fcmToken]);

            // Store in DB
            await userNotificationModel.create({
                sentTo: [vendor._id],
                title,
                body,
            });
        }
        res.json({
            success: true,
            message: 'Photo re-uploaded successfully.',
            photo: photo,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// Active orders: status confirmed and has at least one return photo
exports.getActiveOrders = async (req, res, next) => {
    try {
        const bookings = await Booking.find({
            user: req.user.id,
            status: 'confirmed',
            $or: [
                { returnPhotos: { $exists: false } },
                { returnPhotos: { $size: 0 } },
                { returnPhotos: { $elemMatch: { status: 'pending' } } },
                { returnPhotos: { $elemMatch: { status: 'rejected' } } },
                {
                    returnPhotos: {
                        $elemMatch: { status: { $exists: false } },
                    },
                },
            ],
        })
            .sort('-createdAt')
            .populate({
                path: 'product',
                match: { isDeleted: false, isActive: true },
                //    select: 'deliverProduct slabs oCancellationCharges description feature ideal location oRulesPolicy title images user category subcategory avgRating totalRating price isActive isDeleted createdAt',
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' },
                ],
            })
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus',
            });

        const filtered = bookings.filter(
            b => b.product && b.product.isActive && !b.product.isDeleted
        );
        res.json({ success: true, data: filtered });
    } catch (error) {
        next(error);
    }
};

// Active orders for seller: status confirmed orders for seller's products
exports.getSellerActiveOrders = async (req, res, next) => {
    try {
        const sellerId = req.user.id;
        const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

        const productIds = await Product.find({
            user: sellerObjectId,
            isDeleted: false,
            isActive: true,
        }).distinct('_id');

        // Check for every returnPhotos status - find bookings that need attention
        const bookings = await Booking.find({
            product: { $in: productIds },
            status: 'confirmed',
            $or: [
                { returnPhotos: { $exists: false } },
                { returnPhotos: { $size: 0 } },
                { returnPhotos: { $elemMatch: { status: 'pending' } } },
                { returnPhotos: { $elemMatch: { status: 'rejected' } } },
                {
                    returnPhotos: {
                        $elemMatch: { status: { $exists: false } },
                    },
                },
            ],
        })
            .sort('-createdAt')
            .populate([
                {
                    path: 'product',
                    match: { isDeleted: false, isActive: true },
                    //   select: 'deliverProduct slabs oCancellationCharges description feature ideal location oRulesPolicy title images user category subcategory avgRating totalRating price isActive isDeleted createdAt',

                    populate: [
                        { path: 'category', select: 'name' },
                        { path: 'subcategory', select: 'name' },
                    ],
                },
                { path: 'user', select: 'name email image avatar' },
            ])
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus commissionType commissionPercentage commissionFixedAmount commissionAmount ownerPayoutAmount',
            });

        const filtered = bookings.filter(
            b =>
                b.product &&
                b.product.isActive &&
                !b.product.isDeleted &&
                b.user
        );
        res.json({ success: true, data: filtered });
    } catch (error) {
        next(error);
    }
};

// Order history: shows when any return photo is accepted (approved) used for renter who take product for rent for some days
exports.getOrderHistory = async (req, res, next) => {
    try {
        const bookings = await Booking.find({
            user: req.user.id,
            // "returnPhotos.status": 'approved'
            allReturnPhotosVerify: true,
        })
            .sort('-createdAt')
            .populate({
                path: 'product',
                match: { isDeleted: false, isActive: true },
                populate: [
                    { path: 'category', select: 'name' },
                    { path: 'subcategory', select: 'name' },
                ],
                // });
            })
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus',
            });

        const filtered = bookings.filter(
            b => b.product && b.product.isActive && !b.product.isDeleted
        );

        const bookingIds = filtered.map(b => b._id);
        const reviews = await Review.find({
            user: req.user.id,
            booking: { $in: bookingIds },
        }).select('booking');
        const reviewedSet = new Set(reviews.map(r => r.booking.toString()));

        const data = filtered.map(b => ({
            ...b.toObject(),
            hasReview: reviewedSet.has(b._id.toString()),
        }));
        res.json({ success: true, data: data });
    } catch (error) {
        next(error);
    }
};

exports.getSellerOrderHistory = async (req, res, next) => {
    try {
        const sellerId = req.user.id;
        const sellerObjectId = new mongoose.Types.ObjectId(sellerId);

        const productIds = await Product.find({
            user: sellerObjectId,
            isDeleted: false,
            isActive: true,
        }).distinct('_id');

        const bookings = await Booking.find({
            product: { $in: productIds },
            // "returnPhotos.status": 'approved',
            allReturnPhotosVerify: true,
            user: { $ne: null },
        })
            .sort('-createdAt')
            .populate([
                {
                    path: 'product',
                    match: { isDeleted: false, isActive: true },
                    //   select: 'deliverProduct slabs oCancellationCharges description feature ideal location oRulesPolicy title images user category subcategory avgRating totalRating price isActive isDeleted createdAt',
                    populate: [
                        { path: 'category', select: 'name' },
                        { path: 'subcategory', select: 'name' },
                    ],
                },
                { path: 'user', select: 'name email image avatar' },
            ])
            .populate({
                path: 'payment',
                select: 'totalAmount depositAmount rentalAmount paymentStatus commissionType commissionPercentage commissionFixedAmount commissionAmount ownerPayoutAmount',
            });

        const filtered = bookings.filter(
            b => b.product && b.product.isActive && !b.product.isDeleted
        );

        const bookingIds = filtered.map(b => b._id);
        const reviews = await Review.find({
            booking: { $in: bookingIds },
        }).select('booking');
        const reviewedSet = new Set(reviews.map(r => r.booking.toString()));

        const data = filtered.map(b => ({
            ...b.toObject(),
            hasReview: reviewedSet.has(b._id.toString()),
        }));

        res.json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

exports.sendEnquiry = async (req, res, next) => {
    try {
        if (!req.body.enquiry)
            return res.status(400).json({
                success: false,
                message: 'Please enter enquiry.',
            });

        var _c = {
            sender: 'U',
            subject: req.body.subject,
            msg: req.body.enquiry,
        };
        await enquiryModel.create({
            user: req.user.id,
            chat: _c,
        });

        res.status(201).json({
            success: true,
            message: 'Enquiry send successfully',
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.sendMsg = async (req, res, next) => {
    try {
        const enquiry = await enquiryModel.findById(req.params.id);
        if (!enquiry.isEnded) {
            // var validFile = ['application/pdf', 'application/msword', 'application/vnd.ms-excel']
            // if (req.file) {
            //      var fileType = validFile.includes(req.file.mimetype) ? 'file' : 'img';
            // }
            enquiry.chat.push({
                msg: req.body.msg,
                sender: 'U',
                // type: req.file ? fileType : 'text'
            });

            await enquiry.save();

            res.status(201).json({
                success: true,
                message: 'success',
            });
        } else {
            res.status(201).json({
                success: true,
                message: 'Oops! chat was ended by the Admin.',
            });
        }
    } catch (error) {
        next(error);
    }
};

exports.enquiryList = async (req, res) => {
    try {
        const data = await enquiryModel
            .find({ user: req.user.id })
            .sort({ updatedAt: -1 });

        res.status(201).json({
            success: true,
            // message: req.t('chat_ended'),
            data: data,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

exports.chatHistory = async (req, res, next) => {
    try {
        const enquiry = await enquiryModel.findById(req.params.id);

        await enquiryModel.updateOne(
            { _id: req.params.id },
            { $set: { 'chat.$[elem].isRead': true } },
            { arrayFilters: [{ 'elem.sender': 'A' }] }
        );

        res.status(201).json({
            success: true,
            data: enquiry,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// Rental owner edit booking details
exports.editBookingByRental = async (req, res, next) => {
    try {
        const { bookingId } = req.body;
        let { bookedDates, deliveryType, pickupTime, notes, address } =
            req.body;

        if (!bookingId) {
            return res
                .status(400)
                .json({ success: false, message: 'Booking ID is required' });
        }

        if (typeof bookedDates === 'string') {
            try {
                bookedDates = JSON.parse(bookedDates);
            } catch (_) {}
        }
        if (typeof address === 'string') {
            try {
                address = JSON.parse(address);
            } catch (_) {}
        }

        const booking = await Booking.findOne({ _id: bookingId })
            .populate('product')
            .populate('user', 'name fcmToken');
        // console.log(booking.user);
        // console.log(req.user.id);

        if (!booking) {
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        }

        const product = await Product.findById(booking.product).populate(
            'user',
            'name fcmToken'
        );
        if (!product)
            return res
                .status(404)
                .json({ success: false, message: 'Product not found.' });

        const isRentalOwner =
            booking.user?._id?.toString() === req.user.id.toString();
        if (!isRentalOwner) {
            return res.status(403).json({
                success: false,
                message:
                    'Unauthorized: Only rental owner can edit this booking.',
            });
        }

        // Check if booking can be edited (only pending or confirmed bookings)
        // if (!['pending', 'confirmed'].includes(booking.status)) {
        //      return res.status(400).json({
        //           success: false,
        //           message: 'Booking can only be edited when status is pending or confirmed.'
        //      });
        // }

        // If new dates are provided, check availability
        if (bookedDates && Array.isArray(bookedDates)) {
            // Check if requested dates are available in product's selectDate
            if (
                !booking.product.allDaysAvailable &&
                booking.product.selectDate &&
                booking.product.selectDate.length > 0
            ) {
                const requestedDates = bookedDates.map(
                    d => new Date(d.date || d)
                );
                const availableDates = booking.product.selectDate.map(
                    date => new Date(date)
                );

                const allDatesAvailable = requestedDates.every(requestedDate =>
                    availableDates.some(
                        availableDate =>
                            requestedDate.toDateString() ===
                            availableDate.toDateString()
                    )
                );

                if (!allDatesAvailable) {
                    return res.status(400).json({
                        success: false,
                        message:
                            'Some selected dates are not available for this product.',
                    });
                }
            }

            // Check for overlapping bookings (excluding current booking)
            const justDates = bookedDates.map(d => new Date(d.date || d));
            if (justDates.length > 0) {
                const overlap = await Booking.findOne({
                    product: booking.product._id,
                    _id: { $ne: bookingId },
                    status: { $nin: ['cancelled', 'completed'] },
                    'bookedDates.date': { $in: justDates },
                }).select('_id');

                if (overlap) {
                    return res.status(409).json({
                        success: false,
                        message: 'Selected dates are not available.',
                    });
                }
            }

            booking.bookedDates = bookedDates;
        }

        // Handle verification ID file upload
        if (req.file) {
            booking.verificationId = `/${req.file.filename}`;
        }

        // Update other fields if provided
        if (deliveryType) booking.deliveryType = deliveryType;
        if (pickupTime !== undefined) booking.pickupTime = pickupTime;
        if (notes !== undefined) booking.notes = notes;
        if (address) booking.address = address;

        await booking.save();

        if (booking.user && booking.user.fcmToken) {
            await sendNotificationsToTokens(
                `Booking Updated - ${booking.product.title}`,
                `Booking details for ${booking.product.title} have been updated by the rental user.`,
                [booking.user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title: `Booking Updated - ${booking.product.title}`,
                body: `Booking details for ${booking.product.title} have been updated by the rental user.`,
            });
        }

        if (product.user) {
            await sendNotificationsToTokens(
                `Booking request changes for ${product.title}`,
                `You have received a booking request changes from ${
                    req.user.name || 'a customer'
                }.`,
                [product.user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [product.user._id],
                title: `Booking request changes for ${product.title}`,
                body: `You have received a booking request changes from ${
                    req.user.name || 'a customer'
                }.`,
            });
        }
        res.json({
            success: true,
            message: 'Booking updated successfully.',
            booking,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// Seller cancels booking: refund full amount (rental + deposit) to renter
exports.cancelBookingBySeller = async (req, res, next) => {
    try {
        const { bookingId, reason } = req.body;

        if (!bookingId) {
            return res
                .status(400)
                .json({ success: false, message: 'Booking ID is required' });
        }

        const booking = await Booking.findOne({ _id: bookingId })
            .populate({
                path: 'product',
                populate: { path: 'user', select: 'name email fcmToken' },
            })
            .populate('user', 'name email fcmToken')
            .populate('payment');

        if (!booking) {
            return res
                .status(404)
                .json({ success: false, message: 'Booking not found.' });
        }

        // Verify current user is the product owner (seller)
        const isSeller =
            booking.product?.user?.toString() === req.user.id.toString();
        if (!isSeller) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Only seller can cancel this booking.',
            });
        }

        // Check if booking can be cancelled
        if (booking.status === 'completed') {
            return res.status(400).json({
                success: false,
                message: 'Cannot cancel a completed booking.',
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                message: 'Booking is already cancelled.',
            });
        }

        // If payment exists and was paid, refund full amount (rental + deposit)
        const payment = booking.payment;
        if (payment && payment.paymentStatus === 'paid') {
            if (!payment.stripeChargeId) {
                console.error(
                    'Missing stripeChargeId for payment:',
                    payment._id
                );
                return res.status(400).json({
                    success: false,
                    message:
                        'Payment charge id missing. Please refund the user manually.',
                });
            }

            const fullRefundAmount =
                payment.totalAmount ||
                payment.rentalAmount + (payment.depositAmount || 0);

            try {
                const refund = await stripe.refunds.create({
                    charge: payment.stripeChargeId,
                    amount: Math.round(fullRefundAmount * 100),
                    reason: 'requested_by_customer',
                    metadata: {
                        bookingId: booking._id.toString(),
                        paymentId: payment._id.toString(),
                        cancelledBy: 'seller',
                    },
                });

                payment.refundAmount = fullRefundAmount;
                payment.cancellationCharges = 0;
                payment.cancellationChargesPercentage = 0;
                payment.cancellationAdminCommission = 0;
                payment.cancellationVendorAmount = 0;
                payment.stripeRefundId = refund.id;
                payment.refundedAt = new Date();
                payment.paymentStatus = 'refunded';
                await payment.save();
            } catch (stripeError) {
                console.error(
                    'Stripe refund error (seller cancellation):',
                    stripeError
                );
                return res.status(400).json({
                    success: false,
                    message: `Failed to process refund: ${stripeError.message}`,
                });
            }
        }

        // Update booking record
        booking.status = 'cancelled';
        if (reason) booking.cancellationReason = reason;
        booking.cancellationInitiatedBy = 'seller';
        booking.cancellationInitiatedAt = new Date();
        booking.refundAmount = payment ? payment.refundAmount || 0 : 0;
        booking.cancellationCharges = 0;
        await booking.save();

        // Notify renter about refund
        if (booking.user && booking.user.fcmToken) {
            await sendNotificationsToTokens(
                `Booking Cancelled - ${booking.product.title}`,
                `Your booking for ${
                    booking.product.title
                } was cancelled by the seller. A full refund of AUD $${(
                    booking.refundAmount || 0
                ).toFixed(2)} will be processed in 5-10 business days.`,
                [booking.user.fcmToken]
            );
            await userNotificationModel.create({
                sentTo: [booking.user._id],
                title: `Booking Cancelled - ${booking.product.title}`,
                body: `Your booking for ${
                    booking.product.title
                } was cancelled by the seller. A full refund of AUD $${(
                    booking.refundAmount || 0
                ).toFixed(2)} will be processed in 5-10 business days.`,
            });
        }

        // Notify seller (confirmation)
        if (booking.product?.user && booking.product.user.fcmToken) {
            await sendNotificationsToTokens(
                `You cancelled booking - ${booking.product.title}`,
                `You have cancelled the booking for ${booking.product.title}. The renter will be refunded the full amount.`,
                [booking.product.user.fcmToken]
            );
        }

        res.json({
            success: true,
            message: 'Booking cancelled and refund initiated.',
            booking,
        });
    } catch (error) {
        console.log(error);
        next(error);
    }
};
