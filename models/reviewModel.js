const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Booking',
            required: true,
        },
        rating: {
            type: Number,
            min: 1,
            max: 5,
            required: true,
        },
        review: {
            type: String,
            required: true,
            trim: true,
        },
        images: {
            type: [String],
            default: [],
        },
        video: {
            type: String,
        }
    },
    { timestamps: true }
);

reviewSchema.index({ product: 1 });
reviewSchema.index({ user: 1, product: 1 });

module.exports = mongoose.model('Review', reviewSchema);