const mongoose = require('mongoose');

const faqSchema = mongoose.Schema( 
    {
        en: {
            question: { type: String, required: [true, 'Question is required'] },
            answer:  { type: String, required: [true, 'Answer is required'] },
        },
        ar: {
            question: { type: String, required: [true, 'Question is required'] },
            answer:  { type: String, required: [true, 'Answer is required'] },
        },
    },
    {
        timestamps: true,
    }
);

module.exports = new mongoose.model('faqs', faqSchema);
