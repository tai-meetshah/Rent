const mongoose = require('mongoose');
const validator = require('validator');
const createError = require('http-errors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    qrCode: {
      type: String,
    },
    name: {
      type: String,
    },
    mobileNumber: {
      type: String,
      unique: true,
    },
    password: {
      type: String,
      required: [true, 'validation.password'],
      minlength: [6, 'Password should be atleast 6 characters long.'],
      trim: true,
      select: false,
    },
    birthDate : {
      type: Date
    },
    language: {
      type: String,
      enum: ['en','ar'],
      required: true,
    },
    gender: {
      type: String,
      enum: ['male','female']
    },
    fcmToken: {
      type: String
    },
    token: {
      type: String
    },
    totalPoints: {
      type: Number,
      default: 0,
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
