const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema(
     {
          user: {
               type: mongoose.Schema.Types.ObjectId,
               ref: 'User',
               required: true,
          },
          product: {
               type: mongoose.Schema.Types.ObjectId,
               ref: 'Product',
               required: true,
          },
          bookedDates: [
               {
                    date: { type: Date, required: true },
                    timeSlot: { type: String }, // optional: e.g. "10:00am - 2:00pm"
               },
          ],
          deliveryType: {
               type: String,
               // enum: ['self-pickup', 'delivery'],
               required: true,
          },
          pickupTime: {
               type: String, // store as string ("10:00am") or ISO datetime if stricter
          },
          advancePayment: {
               type: Number,
               default: 0,
          },
          totalPrice: {
               type: Number,
               // required: true,
          },
          status: {
               type: String,
               enum: ['pending', 'confirmed', 'ongoing', 'completed', 'cancelled'],
               default: 'pending',
          },
          paymentStatus: {
               type: String,
               enum: ['unpaid', 'paid', 'refunded'],
               default: 'unpaid',
          },
          returnPhotos: [
               {
                    url: { type: String }, // URL/path to uploaded photo
                    status: {
                         type: String,
                         enum: ['pending', 'approved', 'rejected'],
                    },
                    rejectionReason: { type: String }, // Only if rejected
                    uploadedAt: { type: Date },
               },
          ],
          allReturnPhotosVerify: {
               type: Boolean,
               default: false,
          },
          verificationId: {
               type: String, // could be file upload ref or ID number
          },
          notes: String,
          address: {
               fullName: String,
               mobileNumber: String,
               addressLine: String,
               city: String,
               state: String,
               pincode: String,
               country: String,
          },
          cancellationReason: {
               type: String,
          },
     },
     { timestamps: true }
);

module.exports = mongoose.model('Booking', bookingSchema);
