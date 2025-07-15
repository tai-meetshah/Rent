const mongoose = require('mongoose');

const subCatSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required.'],
        trim: true,
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        ref: 'Category',
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    isDeleted: {
        type: Boolean,
        default: false,
    },
});

module.exports = new mongoose.model('Subcategory', subCatSchema);
