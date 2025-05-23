const mongoose = require('mongoose');

const categorySchema = new mongoose.Schema(
  {
    vendor : {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    name: {
      type: String,
      required: true
    },
    isDelete: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = new mongoose.model('Category', categorySchema);
