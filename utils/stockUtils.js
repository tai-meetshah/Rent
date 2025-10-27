// utils/stockUtils.js
const Booking = require('../models/Booking');

/**
 * Calculate detailed stock availability for a given product.
 * @param {String} productId - MongoDB ObjectId of the product.
 * @param {Number} totalStock - Product's total stock quantity.
 * @param {Array<Date>} availableDates - Optional list of dates (like product.selectDate)
 * @returns {Object} { totalStock, rentedStock, availableStock, dateBookingCounts, dateAvailability }
 */
exports.calculateStockAvailability = async (
    productId,
    totalStock,
    availableDates = []
) => {
    // Get all non-cancelled/non-completed bookings for this product
    const bookings = await Booking.find({
        product: productId,
        status: { $nin: ['cancelled', 'completed'] },
    }).select('bookedDates');

    const dateBookingCounts = {};

    bookings.forEach(booking => {
        booking.bookedDates?.forEach(dateObj => {
            if (dateObj.date) {
                const dateStr = new Date(dateObj.date)
                    .toISOString()
                    .split('T')[0];
                dateBookingCounts[dateStr] =
                    (dateBookingCounts[dateStr] || 0) + 1;
            }
        });
    });

    // Calculate max booked for any date (worst case)
    const maxBookedForAnyDate =
        Object.keys(dateBookingCounts).length > 0
            ? Math.max(...Object.values(dateBookingCounts))
            : 0;

    const rentedStock = maxBookedForAnyDate;
    const availableStock = Math.max(0, totalStock - rentedStock);

    // Create detailed date-wise availability if selectDate is provided
    const dateAvailability = (availableDates || []).map(date => {
        const dateStr = new Date(date).toISOString().split('T')[0];
        const booked = dateBookingCounts[dateStr] || 0;
        const available = Math.max(0, totalStock - booked);
        return {
            date: dateStr,
            booked,
            available,
            total: totalStock,
        };
    });

    return {
        totalStock,
        rentedStock,
        availableStock,
        dateBookingCounts,
        dateAvailability,
    };
};
