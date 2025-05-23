const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema(
    {
        user : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        vendor : {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Wishlist', wishlistSchema);
