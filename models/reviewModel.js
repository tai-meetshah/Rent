const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
    {
        user : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        vendor : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
        },
        rating: {
            type: Number,
            required: true,
        }, 
        review: {
            type: String,
            required: true,
        }, 
    },
    { timestamps: true }
);

module.exports = mongoose.model('Review', reviewSchema);
