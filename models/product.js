const mongoose = require('mongoose');

const chargeSlabSchema = new mongoose.Schema({
    from: { type: Number, required: true },
    to: { type: Number, required: true },
    amount: { type: Number, required: true },
});

const ProductSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Title is required.'],
            trim: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: [true, 'User is required.'],
            ref: 'User',
        },
        category: [
            {
                type: mongoose.Schema.Types.ObjectId,
                required: [true, 'Category is required.'],
                ref: 'Category',
            },
        ],
        subcategory: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Subcategory',
            },
        ],
        description: {
            type: String,
            required: [true, 'Description is required.'],
            trim: true,
        },
        feature: {
            type: String,
            trim: true,
        },
        ideal: {
            type: String,
            trim: true,
        },
        price: {
            type: Number,
            trim: true,
        },
        inStock: { type: Boolean, required: true },
        stockQuantity: {
            type: String,
            required: function () {
                return this.inStock;
            },
        },
        deposit: { type: Boolean, required: true },
        depositAmount: {
            type: String,
        },
        deliverProduct: { type: Boolean, required: true },
        slabs: [chargeSlabSchema],
        deliver: { type: String, required: true },
        selectDate: [{ type: Date }],
        allDaysAvailable: { type: Boolean, default: false },
        keywords: [{ type: String, required: true }],
        images: {
            type: [String],
        },
        review: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Review',
        },
        avgRating: {
            type: Number,
            default: 0,
        },
        totalRating: {
            type: Number,
            default: 0,
        },
        isDeleted: { type: Boolean, default: false, select: false },
        isActive: {
            type: Boolean,
            default: true,
        },
        coordinates: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point',
            },
            coordinates: {
                type: [Number],
                index: '2dsphere',
            },
        },
        latitude: {
            type: String,
        },
        longitude: {
            type: String,
        },
        location: {
            type: String,
        },
        oName: {
            type: String,
            trim: true,
        },
        oEmail: {
            type: String,
            lowercase: true,
        },
        oCoordinates: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point',
            },
            coordinates: {
                type: [Number],
                index: '2dsphere',
            },
        },
        oLatitude: {
            type: String,
        },
        oLongitude: {
            type: String,
        },
        oLocation: {
            type: String,
        },
        oCancellationCharges: [
            {
                hoursBefore: {
                    type: String,
                    // required: true,
                },
                chargeAmount: {
                    type: String,
                    // required: true,
                },
            },
        ],
        oRentingOut: { type: Boolean },
        oRulesPolicy: {
            type: String,
        },
        step: {
            type: String,
        },
        publish: { type: Boolean, default: false },
    },
    { timestamps: true }
);

ProductSchema.index({ coordinates: '2dsphere' }, { background: true });

// Method to calculate available stock
ProductSchema.methods.getAvailableStock = async function () {
    const Booking = require('./Booking');

    try {
        // ✅ Current date in UTC (start of day)
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);

        const totalStock = parseInt(this.stockQuantity) || 0;

        // If product is available all days, count bookings for all dates
        if (this.allDaysAvailable) {
            const bookings = await Booking.find({
                product: this._id,
                status: { $nin: ['cancelled', 'completed'] },
            }).select('bookedDates');

            const dateBookingCounts = {};
            bookings.forEach(booking => {
                if (booking.bookedDates && booking.bookedDates.length > 0) {
                    booking.bookedDates.forEach(dateObj => {
                        if (dateObj.date) {
                            const dateUTC = new Date(dateObj.date);
                            dateUTC.setUTCHours(0, 0, 0, 0);
                            const dateString = dateUTC
                                .toISOString()
                                .split('T')[0];

                            if (!dateBookingCounts[dateString]) {
                                dateBookingCounts[dateString] = 0;
                            }
                            dateBookingCounts[dateString]++;
                        }
                    });
                }
            });

            const maxBooked =
                Object.keys(dateBookingCounts).length > 0
                    ? Math.max(...Object.values(dateBookingCounts))
                    : 0;

            return {
                totalStock,
                rentedStock: maxBooked,
                availableStock: Math.max(0, totalStock - maxBooked),
            };
        }

        // Only consider future dates from selectDate
        const futureDatesUTC = (this.selectDate || [])
            .map(d => {
                const date = new Date(d);
                date.setUTCHours(0, 0, 0, 0);
                return date;
            })
            .filter(date => date >= todayUTC);

        if (
            this.selectDate &&
            this.selectDate.length > 0 &&
            futureDatesUTC.length === 0
        ) {
            return {
                totalStock,
                rentedStock: totalStock,
                availableStock: 0,
            };
        }

        // Get all active bookings for this product
        const bookings = await Booking.find({
            product: this._id,
            status: { $nin: ['cancelled', 'completed'] },
        }).select('bookedDates');

        const dateBookingCounts = {};
        bookings.forEach(booking => {
            if (booking.bookedDates && booking.bookedDates.length > 0) {
                booking.bookedDates.forEach(dateObj => {
                    if (dateObj.date) {
                        const dateUTC = new Date(dateObj.date);
                        dateUTC.setUTCHours(0, 0, 0, 0);
                        const dateString = dateUTC.toISOString().split('T')[0];

                        if (!dateBookingCounts[dateString]) {
                            dateBookingCounts[dateString] = 0;
                        }
                        dateBookingCounts[dateString]++;
                    }
                });
            }
        });

        const selectDateSet = futureDatesUTC.map(
            d => d.toISOString().split('T')[0]
        );

        const relevantCounts = Object.keys(dateBookingCounts)
            .filter(
                date =>
                    selectDateSet.length === 0 || selectDateSet.includes(date)
            )
            .map(d => dateBookingCounts[d]);

        const maxBooked =
            relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;

        return {
            totalStock,
            rentedStock: maxBooked,
            availableStock: Math.max(0, totalStock - maxBooked),
        };
    } catch (error) {
        console.error('Error calculating available stock:', error);
        return {
            totalStock: parseInt(this.stockQuantity) || 0,
            rentedStock: 0,
            availableStock: parseInt(this.stockQuantity) || 0,
        };
    }
};

// Static method to get available stock for multiple products
ProductSchema.statics.getAvailableStockForProducts = async function (
    productIds
) {
    const Booking = require('./Booking');

    try {
        // 1️⃣ Get current date in UTC (midnight)
        const todayUTC = new Date();
        todayUTC.setUTCHours(0, 0, 0, 0);

        // 2️⃣ Get products
        const products = await this.find({ _id: { $in: productIds } }).select(
            '_id stockQuantity selectDate allDaysAvailable'
        );

        // 3️⃣ Get active bookings
        const bookings = await Booking.find({
            product: { $in: productIds },
            status: { $nin: ['cancelled', 'completed'] },
        }).select('product bookedDates');

        // 4️⃣ Map to store bookings per product per date
        const productDateCounts = {};
        products.forEach(product => {
            productDateCounts[product._id.toString()] = {};
        });

        bookings.forEach(booking => {
            const productIdStr = booking.product.toString();
            if (booking.bookedDates && booking.bookedDates.length > 0) {
                booking.bookedDates.forEach(dateObj => {
                    if (dateObj.date) {
                        const dateString = new Date(dateObj.date)
                            .toISOString()
                            .split('T')[0]; // Always UTC
                        if (!productDateCounts[productIdStr][dateString]) {
                            productDateCounts[productIdStr][dateString] = 0;
                        }
                        productDateCounts[productIdStr][dateString]++;
                    }
                });
            }
        });

        // 5️⃣ Calculate stock
        const result = {};

        products.forEach(product => {
            const totalStock = parseInt(product.stockQuantity) || 0;
            const productIdStr = product._id.toString();

            // If allDaysAvailable, ignore selectDate
            if (product.allDaysAvailable) {
                const allDateCounts = productDateCounts[productIdStr] || {};
                const maxBooked = Object.values(allDateCounts).length
                    ? Math.max(...Object.values(allDateCounts))
                    : 0;

                result[productIdStr] = {
                    totalStock,
                    rentedStock: maxBooked,
                    availableStock: Math.max(0, totalStock - maxBooked),
                };
                return;
            }

            // Normalize selectDate to UTC midnight
            const selectDateSet = (product.selectDate || [])
                .map(d => {
                    const date = new Date(d);
                    date.setUTCHours(0, 0, 0, 0);
                    return date.toISOString().split('T')[0];
                })
                .filter(
                    dateStr => new Date(dateStr + 'T00:00:00Z') >= todayUTC
                );

            // If no relevant dates, mark all stock as rented
            if (
                product.selectDate &&
                product.selectDate.length > 0 &&
                selectDateSet.length === 0
            ) {
                result[productIdStr] = {
                    totalStock,
                    rentedStock: totalStock,
                    availableStock: 0,
                };
                return;
            }

            const allDateCounts = productDateCounts[productIdStr] || {};
            const relevantCounts = Object.keys(allDateCounts)
                .filter(
                    date =>
                        selectDateSet.length === 0 ||
                        selectDateSet.includes(date)
                )
                .map(d => allDateCounts[d]);

            const maxBooked = relevantCounts.length
                ? Math.max(...relevantCounts)
                : 0;

            result[productIdStr] = {
                totalStock,
                rentedStock: maxBooked,
                availableStock: Math.max(0, totalStock - maxBooked),
            };
        });

        return result;
    } catch (error) {
        console.error('Error calculating available stock for products:', error);
        return {};
    }
};

// Static method to get total rental count (including historical) for multiple products
ProductSchema.statics.getTotalRentalCountForProducts = async function (
    productIds
) {
    const Booking = require('./Booking');

    try {
        // Get total booking counts for all products (including completed bookings)
        const totalBookingCounts = await Booking.aggregate([
            {
                $match: {
                    product: { $in: productIds },
                    status: {
                        $in: ['pending', 'confirmed', 'ongoing', 'completed'],
                    },
                },
            },
            {
                $group: {
                    _id: '$product',
                    totalRentals: { $sum: 1 },
                },
            },
        ]);

        // Create a map of product ID to total rental count
        const totalRentalMap = {};
        totalBookingCounts.forEach(item => {
            totalRentalMap[item._id.toString()] = item.totalRentals;
        });

        return totalRentalMap;
    } catch (error) {
        console.error(
            'Error calculating total rental count for products:',
            error
        );
        return {};
    }
};

// Pure helper: compute available stock map from in-memory product and booking arrays.
ProductSchema.statics.computeAvailableStockFromData = function (
    products,
    bookings
) {
    // ✅ Current date in UTC (start of day)
    const todayUTC = new Date();
    todayUTC.setUTCHours(0, 0, 0, 0);

    // Build date counts per product
    const productDateCounts = {};

    products.forEach(product => {
        const id = product._id.toString();
        productDateCounts[id] = {};
    });

    bookings.forEach(booking => {
        const productIdStr = booking.product.toString();
        if (!productDateCounts[productIdStr]) return;

        if (booking.bookedDates && booking.bookedDates.length > 0) {
            booking.bookedDates.forEach(dateObj => {
                if (dateObj.date) {
                    const dateUTC = new Date(dateObj.date);
                    dateUTC.setUTCHours(0, 0, 0, 0);
                    const dateString = dateUTC.toISOString().split('T')[0];

                    if (!productDateCounts[productIdStr][dateString]) {
                        productDateCounts[productIdStr][dateString] = 0;
                    }
                    productDateCounts[productIdStr][dateString]++;
                }
            });
        }
    });

    const result = {};

    products.forEach(product => {
        const totalStock = parseInt(product.stockQuantity) || 0;
        const productIdStr = product._id.toString();

        // If allDaysAvailable is true, consider all dates
        if (product.allDaysAvailable) {
            const allDateCounts = productDateCounts[productIdStr] || {};
            const relevantCounts = Object.values(allDateCounts);
            const maxBookedForAnyDate =
                relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;

            result[productIdStr] = {
                totalStock,
                rentedStock: maxBookedForAnyDate,
                availableStock: Math.max(0, totalStock - maxBookedForAnyDate),
            };
            return;
        }

        // Filter selectDate to only include today and future dates (UTC)
        const futureDatesUTC = (product.selectDate || [])
            .map(d => {
                const date = new Date(d);
                date.setUTCHours(0, 0, 0, 0);
                return date;
            })
            .filter(date => date >= todayUTC);

        // If all selectDate values are in the past, product is unavailable
        if (
            product.selectDate &&
            product.selectDate.length > 0 &&
            futureDatesUTC.length === 0
        ) {
            result[productIdStr] = {
                totalStock,
                rentedStock: totalStock,
                availableStock: 0,
            };
            return;
        }

        const selectDateSet = futureDatesUTC.map(
            d => d.toISOString().split('T')[0]
        );
        const allDateCounts = productDateCounts[productIdStr] || {};

        const relevantCounts = Object.keys(allDateCounts)
            .filter(
                date =>
                    selectDateSet.length === 0 || selectDateSet.includes(date)
            )
            .map(d => allDateCounts[d]);

        const maxBookedForAnyDate =
            relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;

        result[productIdStr] = {
            totalStock,
            rentedStock: maxBookedForAnyDate,
            availableStock: Math.max(0, totalStock - maxBookedForAnyDate),
        };
    });

    return result;
};


module.exports = new mongoose.model('Product', ProductSchema);
