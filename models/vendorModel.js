const mongoose = require('mongoose');
const validator = require('validator');
const createError = require('http-errors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const vendorSchema = new mongoose.Schema(
  {
    qrCode: {
      type: String,
    },
    email: {
      type: String,
      required: [true, 'validation.email'],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, 'validation.emailInvalid'],
    },
    password: {
      type: String,
      required: [true, 'validation.password'],
      minlength: [6, 'Password should be atleast 6 characters long.'],
      trim: true,
      select: false,
    },
    language: {
      type: String,
      enum: ['en','ar'],
      required: true,
    },

    businessType : {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BusinessType',
    },
    businessName: {
      type: String,
    },
    businessMobile: {
      type: String,
    },
    businessLogo: {
      type: String,
    },
    businessLicense: {
      type: String,
    },

    adminApproved: {
      type: Boolean,
      default: false,
    },
    signupStep: {
      type: Number
    },
    businessRating: {
      type: Number,
      default : 0
    },
    businessReview: {
      type: Number,
      default : 0
    },
    fcmToken: {
      type: String
    },
    token: {
      type: String
    },
    isNotification: {
      type: Boolean,
      default: true,
    },
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
vendorSchema.methods.generateAuthToken = async function () {
    try {
        return jwt.sign({ _id: this._id.toString() }, process.env.JWT_SECRET, {
            expiresIn: '90d',
        });
    } catch (error) {
        throw createError.BadRequest(error);
    }
};

// Converting password into hash
vendorSchema.post('validate', async function (doc) {
  if (doc.isModified('password')) {
      if (doc.password) doc.password = await bcrypt.hash(doc.password, 10);
  }
});

// check password
vendorSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

module.exports = new mongoose.model('Vendor', vendorSchema);
