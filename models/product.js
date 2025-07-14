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
        publish: { type: Boolean },
    },
    { timestamps: true }
);

ProductSchema.index({ coordinates: '2dsphere' }, { background: true });

module.exports = new mongoose.model('Product', ProductSchema);
