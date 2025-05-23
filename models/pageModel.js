const mongoose = require('mongoose');

const pageSchema = mongoose.Schema(
    {
        key: {
            type: String,
            required: [true, 'Title is required'],
            unique: true,
        },
        en: {
            title: { type: String, required: [true, 'Title is required'] },
            content: String,
        },
        ar: {
            title: { type: String, required: [true, 'Title is required'] },
            content: String,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = new mongoose.model('Page', pageSchema);
