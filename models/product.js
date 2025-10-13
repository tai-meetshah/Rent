const mongoose = require('mongoose');
// const validator = require('validator');
// const validate = require('../utils/validation.json');

// const toTitleCase = x =>
//     x.replace(
//         /\w\S*/g,
//         txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
//     );

const chargeSlabSchema = new mongoose.Schema({
    from: { type: Number, required: true }, // e.g. 0
    to: { type: Number, required: true }, // e.g. 25
    amount: { type: Number, required: true }, // e.g. 100
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
                // required: [true, 'Subcategory is required.'],
                ref: 'Subcategory',
            },
        ],
        description: {
            type: String,
            required: [true, 'Description is required.'],
            trim: true,
        },
        feature: {
            //key features
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
            // required: function () {
            //     return this.inStock;
            // },
        },

        deliverProduct: { type: Boolean, required: true }, //deliverProduct to renter

        slabs: [chargeSlabSchema],
        deliver: { type: String, required: true }, //car bike

        selectDate: [{ type: Date }],
        allDaysAvailable: { type: Boolean, default: false },
        keywords: [{ type: String, required: true }],

        images: {
            type: [String],
            // validate: {
            //     validator: function (images) {
            //         return images.length <= 6;
            //     },
            //     message: 'Maximum 6 images allowed.',
            // },
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
            // validate: [validator.isEmail, validate.emailInvalid],
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
                    required: true, // e.g. 24 or 12
                },
                chargeAmount: {
                    type: String,
                    required: true, // e.g. 50 or 100
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
        publish: { type: Boolean, default: false, },
    },
    { timestamps: true }
);

ProductSchema.index({ coordinates: '2dsphere' }, { background: true });

// Method to calculate available stock
ProductSchema.methods.getAvailableStock = async function () {
    const Booking = require('./Booking');

    try {
        // Get total stock quantity
        const totalStock = parseInt(this.stockQuantity) || 0;

        // Count active bookings for this product
        // Active bookings are those with status: pending, confirmed, or ongoing
        const activeBookingsCount = await Booking.countDocuments({
            product: this._id,
            status: { $in: ['pending', 'confirmed', 'ongoing'] }
        });

        // Calculate available stock
        const availableStock = Math.max(0, totalStock - activeBookingsCount);

        return {
            totalStock,
            rentedStock: activeBookingsCount,
            availableStock
        };
    } catch (error) {
        console.error('Error calculating available stock:', error);
        return {
            totalStock: parseInt(this.stockQuantity) || 0,
            rentedStock: 0,
            availableStock: parseInt(this.stockQuantity) || 0
        };
    }
};

// Static method to get available stock for multiple products
ProductSchema.statics.getAvailableStockForProducts = async function (productIds) {
    const Booking = require('./Booking');

    try {
        // Get all products with their stock quantities
        const products = await this.find({ _id: { $in: productIds } }).select('_id stockQuantity');

        // Get booking counts for all products
        const bookingCounts = await Booking.aggregate([
            {
                $match: {
                    product: { $in: productIds },
                    status: { $in: ['pending', 'confirmed', 'ongoing'] }
                }
            },
            {
                $group: {
                    _id: '$product',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Create a map of product ID to booking count
        const bookingCountMap = {};
        bookingCounts.forEach(item => {
            bookingCountMap[item._id.toString()] = item.count;
        });

        // Calculate available stock for each product
        const result = {};
        products.forEach(product => {
            const totalStock = parseInt(product.stockQuantity) || 0;
            const rentedStock = bookingCountMap[product._id.toString()] || 0;
            const availableStock = Math.max(0, totalStock - rentedStock);

            result[product._id.toString()] = {
                totalStock,
                rentedStock,
                availableStock
            };
        });

        return result;
    } catch (error) {
        console.error('Error calculating available stock for products:', error);
        return {};
    }
};

// Static method to get total rental count (including historical) for multiple products
ProductSchema.statics.getTotalRentalCountForProducts = async function (productIds) {
    const Booking = require('./Booking');

    try {
        // Get total booking counts for all products (including completed bookings)
        const totalBookingCounts = await Booking.aggregate([
            {
                $match: {
                    product: { $in: productIds },
                    status: { $in: ['pending', 'confirmed', 'ongoing', 'completed'] }
                }
            },
            {
                $group: {
                    _id: '$product',
                    totalRentals: { $sum: 1 }
                }
            }
        ]);

        // Create a map of product ID to total rental count
        const totalRentalMap = {};
        totalBookingCounts.forEach(item => {
            totalRentalMap[item._id.toString()] = item.totalRentals;
        });

        return totalRentalMap;
    } catch (error) {
        console.error('Error calculating total rental count for products:', error);
        return {};
    }
};

module.exports = new mongoose.model('Product', ProductSchema);
