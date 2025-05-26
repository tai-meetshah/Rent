const mongoose = require('mongoose');

const otpSchema = mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    expireAt: {
        type: Date,
        expires: 0,
    },
});

module.exports = new mongoose.model('otp', otpSchema);
