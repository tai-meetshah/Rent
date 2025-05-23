const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema(
    {
        route : {
            type: String,
        },
        name : {
            type: String,
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('module', moduleSchema);
