const mongoose = require('mongoose');

const otpSchema = mongoose.Schema(
    {
        mobileNumber: { type: String, required: true },
        otp:  { type: String, required: true },
    },
    {
        timestamps: true,
    }
);

module.exports = new mongoose.model('otp', otpSchema);
