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
        favourites: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Product',
            },
        ],
        photo: { type: String, default: 'default_user.jpg' },
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
            // required: [true, 'Please provide zipcode.'],
        },
        googleId: String,
        facebookId: String,
        appleId: String,
        password: {
            type: String,
            // required: [true, 'validation.password'],
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
        isOnline: Boolean,
        lastSeen: Date,
        isDelete: {
            type: Boolean,
            default: false,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        // Stripe Connect fields for seller payouts
        stripeConnectAccountId: {
            type: String,
            default: null,
        },
        stripeAccountStatus: {
            type: String,
            enum: ['not_started', 'pending', 'verified', 'restricted', 'rejected'],
            default: 'not_started',
        },
        stripeOnboardingComplete: {
            type: Boolean,
            default: false,
        },
        stripeAccountType: {
            type: String,
            enum: ['express', 'standard', 'custom'],
            default: 'express',
        },
        stripeChargesEnabled: {
            type: Boolean,
            default: false,
        },
        stripePayoutsEnabled: {
            type: Boolean,
            default: false,
        },
        stripeDetailsSubmitted: {
            type: Boolean,
            default: false,
        },
        // Chat subscription fields
        // hasSubscription: {
        //     type: Boolean,
        //     default: false,
        // },
        // subscriptionExpiresAt: {
        //     type: Date,
        //     default: null,
        // },
        // subscriptionActivatedAt: {
        //     type: Date,
        //     default: null,
        // },
        // // Current active subscription ID
        // activeSubscriptionId: {
        //     type: mongoose.Schema.Types.ObjectId,
        //     ref: 'Subscription',
        //     default: null,
        // },
        // // Stripe subscription details
        // stripeSubscriptionId: {
        //     type: String,
        //     default: null,
        // },
        // stripeCustomerId: {
        //     type: String,
        //     default: null,
        // },
        // // Track unique users they've chatted with (for free tier limit)
        // chattedWith: [
        //     {
        //         type: mongoose.Schema.Types.ObjectId,
        //         ref: 'User',
        //     },
        // ],
        // lastChatReset: {
        //     type: Date,
        //     default: Date.now,
        // },
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
