const mongoose = require('mongoose');
const validator = require('validator');
const createError = require('http-errors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please provide name.'],
        },
        email: {
            type: String,
            unique: true,
            required: [true, 'Please provide email.'],
        },
        address: {
            type: String,
            required: [true, 'Please provide address.'],
        },
        landmark: {
            type: String,
        },
        city: {
            type: String,
            required: [true, 'Please provide city.'],
        },
        state: {
            type: String,
            required: [true, 'Please provide state.'],
        },
        country: {
            type: String,
            required: [true, 'Please provide country.'],
        },
        zipcode: {
            type: String,
            required: [true, 'Please provide zipcode.'],
        },
        password: {
            type: String,
            required: [true, 'validation.password'],
            minlength: [6, 'Password should be atleast 6 characters long.'],
            trim: true,
            select: false,
        },
        fcmToken: {
            type: String,
        },
        // isNotification: {
        //     type: Boolean,
        //     default: true,
        // },
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
userSchema.methods.generateAuthToken = async function () {
    try {
        return jwt.sign({ _id: this._id.toString() }, process.env.JWT_SECRET, {
            expiresIn: '90d',
        });
    } catch (error) {
        throw createError.BadRequest(error);
    }
};

// Converting password into hash
userSchema.post('validate', async function (doc) {
    if (doc.isModified('password')) {
        if (doc.password) doc.password = await bcrypt.hash(doc.password, 10);
    }
});

// check password
userSchema.methods.correctPassword = async function (
    candidatePassword,
    userPassword
) {
    return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = new mongoose.model('User', userSchema);
