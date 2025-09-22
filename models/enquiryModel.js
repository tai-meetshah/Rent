const mongoose = require('mongoose');
const AutoIncrement = require('mongoose-sequence')(mongoose);

const enquirySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        },
        isViewed: {
            type: Boolean,
            default: false,
        },
        chat: [
            {
                sender: { type: String, enum: ['U', 'A'] },
                msg: { type: String },
                subject: { type: String },
                isRead: { type: Boolean, default: false },
                created: { type: Date, default: Date.now },
            },
        ],
        isEnded: {
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

enquirySchema.plugin(AutoIncrement, {
    inc_field: 'enquiryNumber',
    start_seq: 10,
});

module.exports = mongoose.model('enquiries', enquirySchema);
