const mongoose = require('mongoose');
const validator = require('validator');
const createError = require('http-errors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const staffSchema = new mongoose.Schema(
    {
        qrCode: {
            type: String,
        },
        vendor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Vendor',
        },
        branch: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Branch',
        },
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: [true, 'validation.email'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        mobileNumber: {
            type: String,
            unique: true,
        },
        occupation: {
            type: String,
            required: true,
        },
        password: {
            type: String,
            required: true,
        },
        language: {
            type: String,
            enum: ['en', 'ar'],
            default: 'en',
        },

        fcmToken: {
            type: String,
        },
        token: {
            type: String,
        },

        isNotification: {
            type: Boolean,
            default: true,
        },
        isDelete: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
    },
    { timestamps: true }
);


// generating tokens
staffSchema.methods.generateAuthToken = async function () {
    try {
        return jwt.sign({ _id: this._id.toString() }, process.env.JWT_SECRET, {
            expiresIn: '90d',
        });
    } catch (error) {
        throw createError.BadRequest(error);
    }
};


module.exports = new mongoose.model('Staff', staffSchema);
