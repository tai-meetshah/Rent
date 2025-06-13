const mongoose = require('mongoose');
const validator = require('validator');
const validate = require('../utils/validation.json');


const toTitleCase = x =>
    x.replace(
        /\w\S*/g,
        txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );

const MerchantSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Item name is required.'],
            trim: true,
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
                required: [true, 'Subcategory is required.'],
                ref: 'Subcategory',
            },
        ],
        country: {
            type: String,
            required: [true, 'Country is required.'],
            trim: true,
            set: toTitleCase,
        },
        state: {
            type: String,
            required: [true, 'State is required.'],
            trim: true,
            set: toTitleCase,
        },
        city: {
            type: String,
            required: [true, 'City is required.'],
            trim: true,
            set: toTitleCase,
        },
        address: {
            type: String,
            required: [true, 'Address is required.'],
            trim: true,
        },
        call: {
            type: String,
            required: [true, 'Phone number is required.'],
        },
        email: {
            type: String,
            required: [true, validate.email],
            unique: true,
            lowercase: true,
            validate: [validator.isEmail, validate.emailInvalid],
        },
        images: {
            type: [String],
            validate: {
                validator: function (images) {
                    return images.length <= 6;
                },
                message: 'Maximum 6 images allowed.',
            },
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
        facebook: { type: String, trim: true },
        instagram: { type: String, trim: true },
        twitter: { type: String, trim: true },
        youtube: { type: String, trim: true },
        isDeleted: { type: Boolean, default: false, select: false },
        offers: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Offer',
            },
        ],
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
        date: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

MerchantSchema.index({ coordinates: '2dsphere' }, { background: true });

module.exports = new mongoose.model('Merchant', MerchantSchema);
