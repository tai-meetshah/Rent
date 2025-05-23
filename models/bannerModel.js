const mongoose = require('mongoose');

const bannerSchema = new mongoose.Schema(
    {
        image: {
            type: String,
            required: true,
        },
        sort: {
            type: Number,
        }, 
    },
    { timestamps: true }
);

module.exports = mongoose.model('Banners', bannerSchema);
