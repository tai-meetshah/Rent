// models/SearchHistory.js
const mongoose = require('mongoose');

const searchHistorySchema = new mongoose.Schema({
     userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
     },
     term: {
          type: String,
          required: true,
          trim: true
     },
     searchedAt: {
          type: Date,
          default: Date.now
     }
});

// Optional index for faster query
searchHistorySchema.index({ userId: 1, term: 1 }, { unique: false });

module.exports = mongoose.model('SearchHistory', searchHistorySchema);
