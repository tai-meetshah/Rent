const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    sentTo: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    ],

    title: {
        type: String,
        required: true,
    },
    body: {
        type: String,
        required: true,
    },
    image: {
        type: String,
        required: true,
    },

    readBy: [
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
    ],
    createdAt: { type: Date, default: Date.now },
    expireAt: {
        type: Date,
        expires: 0,
        default: () => new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // Expires after 60 days
    },
});

notificationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 }); // Set up TTL index

module.exports = new mongoose.model('userNotification', notificationSchema);
