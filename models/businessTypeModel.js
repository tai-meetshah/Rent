const mongoose = require('mongoose');

const businessTypeSchema = new mongoose.Schema(
    {
        en: {
            name: {
                type: String,
                required: [true, 'Name is required.'],
                trim: true,
            },
        },
        ar: {
            name: {
                type: String,
                required: [true, 'Name is required.'],
                trim: true,
            },
        },
        image: {
            type: String,
            required: true
        },
        isActive: {
            type: Boolean,
            default: true
        },
        isDelete: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('BusinessType', businessTypeSchema);
