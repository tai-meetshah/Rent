const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema(
  {
    vendor : {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vendor',
    },
    buildingNo: {
      type: String,
      required: true
    },
    buildingName: {
      type: String,
      required: true,
    },
    roadName: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    country: {
      type: String,
      required: true
    },
    location: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
    isDelete: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

branchSchema.index({ location: '2dsphere' });

module.exports = new mongoose.model('Branch', branchSchema);
