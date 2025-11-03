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
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const totalStock = parseInt(this.stockQuantity) || 0;

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
                            const dateString = new Date(dateObj.date)
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

            const maxBookedForAnyDate = Object.keys(dateBookingCounts).length > 0
                ? Math.max(...Object.values(dateBookingCounts))
                : 0;

            const rentedStock = maxBookedForAnyDate;
            const availableStock = Math.max(0, totalStock - rentedStock);

            return {
                totalStock,
                rentedStock,
                availableStock,
            };
        }

        const futureDates = (this.selectDate || [])
            .filter(date => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d >= today;
            });

        if (this.selectDate && this.selectDate.length > 0 && futureDates.length === 0) {
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

        // Count bookings for each date
        const dateBookingCounts = {};
        bookings.forEach(booking => {
            if (booking.bookedDates && booking.bookedDates.length > 0) {
                booking.bookedDates.forEach(dateObj => {
                    if (dateObj.date) {
                        const dateString = new Date(dateObj.date)
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

        const selectDateSet = futureDates.map(
            d => new Date(d).toISOString().split('T')[0]
        );

        const relevantCounts = Object.keys(dateBookingCounts)
            .filter(
                date =>
                    selectDateSet.length === 0 || selectDateSet.includes(date)
            )
            .map(d => dateBookingCounts[d]);

        const maxBookedForAnyDate =
            relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;

        const rentedStock = maxBookedForAnyDate;
        const availableStock = Math.max(0, totalStock - rentedStock);

        return {
            totalStock,
            rentedStock,
            availableStock,
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
        // Get current date (normalized to start of day)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Get all products with their stock quantities and selectDate
        const products = await this.find({ _id: { $in: productIds } }).select(
            '_id stockQuantity selectDate allDaysAvailable'
        );

        // Get all active bookings for these products
        const bookings = await Booking.find({
            product: { $in: productIds },
            status: { $nin: ['cancelled', 'completed'] },
        }).select('product bookedDates');

        // Create a map to store date booking counts for each product
        const productDateCounts = {};

        // Initialize the map
        products.forEach(product => {
            productDateCounts[product._id.toString()] = {};
        });

        // Count bookings per date for each product
        bookings.forEach(booking => {
            const productIdStr = booking.product.toString();
            if (booking.bookedDates && booking.bookedDates.length > 0) {
                booking.bookedDates.forEach(dateObj => {
                    if (dateObj.date) {
                        const dateString = new Date(dateObj.date)
                            .toISOString()
                            .split('T')[0];
                        if (!productDateCounts[productIdStr][dateString]) {
                            productDateCounts[productIdStr][dateString] = 0;
                        }
                        productDateCounts[productIdStr][dateString]++;
                    }
                });
            }
        });

        // Calculate available stock for each product based on MAXIMUM bookings on any relevant date
        const result = {};
        products.forEach(product => {
            const totalStock = parseInt(product.stockQuantity) || 0;
            const productIdStr = product._id.toString();

            // If allDaysAvailable is true, product is always available (ignore selectDate)
            if (product.allDaysAvailable) {
                const allDateCounts = productDateCounts[productIdStr] || {};
                const relevantCounts = Object.values(allDateCounts);
                const maxBookedForAnyDate =
                    relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;
                const rentedStock = maxBookedForAnyDate;
                const availableStock = Math.max(0, totalStock - rentedStock);

                result[productIdStr] = {
                    totalStock,
                    rentedStock,
                    availableStock,
                };
                return;
            }

            let selectDateSet = (product.selectDate || [])
                .map(d => {
                    const date = new Date(d);
                    date.setHours(0, 0, 0, 0);
                    return { date, dateString: date.toISOString().split('T')[0] };
                })
                .filter(dateObj => dateObj.date >= today) // Only include today and future dates
                .map(dateObj => dateObj.dateString);

            if (product.selectDate && product.selectDate.length > 0 && selectDateSet.length === 0) {
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

            // Find the maximum bookings on any single relevant date
            const maxBookedForAnyDate =
                relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;

            const rentedStock = maxBookedForAnyDate;
            const availableStock = Math.max(0, totalStock - rentedStock);

            result[productIdStr] = {
                totalStock,
                rentedStock,
                availableStock,
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
    // Get current date (normalized to start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
                    const dateString = new Date(dateObj.date)
                        .toISOString()
                        .split('T')[0];
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

        // If allDaysAvailable is true, don't filter by dates
        if (product.allDaysAvailable) {
            const allDateCounts = productDateCounts[productIdStr] || {};
            const relevantCounts = Object.values(allDateCounts);
            const maxBookedForAnyDate =
                relevantCounts.length > 0 ? Math.max(...relevantCounts) : 0;
            const rentedStock = maxBookedForAnyDate;
            const availableStock = Math.max(0, totalStock - rentedStock);

            result[productIdStr] = {
                totalStock,
                rentedStock,
                availableStock,
            };
            return;
        }

        // Filter selectDate to only include today and future dates
        const futureDates = (product.selectDate || [])
            .filter(date => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d >= today;
            });

        // If selectDate was defined but all dates are in the past, mark as unavailable
        if (product.selectDate && product.selectDate.length > 0 && futureDates.length === 0) {
            result[productIdStr] = {
                totalStock,
                rentedStock: totalStock,
                availableStock: 0,
            };
            return;
        }

        const selectDateSet = futureDates.map(
            d => new Date(d).toISOString().split('T')[0]
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

        const rentedStock = maxBookedForAnyDate;
        const availableStock = Math.max(0, totalStock - rentedStock);

        result[productIdStr] = {
            totalStock,
            rentedStock,
            availableStock,
        };
    });

    return result;
};

module.exports = new mongoose.model('Product', ProductSchema);
