const mongoose = require('mongoose');
require('dotenv').config();

// Use the actual Payment model
const Payment = require('./models/paymentModel');

async function deleteDummyPayments() {
    try {
        console.log('Connecting to MongoDB...');

        // Connect to MongoDB
        await mongoose.connect(process.env.DATABASE, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('Connected! Deleting dummy payment data...');

        // Delete all payments that were created by the seed script
        // These have the dummy ObjectIds we created
        const result = await Payment.deleteMany({
            paymentStatus: 'paid',
            commissionType: 'percentage',
            commissionPercentage: 15
        });

        console.log(`✓ Successfully deleted ${result.deletedCount} dummy payments`);

        mongoose.connection.close();
        console.log('✓ Done! Database connection closed.');

    } catch (error) {
        console.error('Error deleting dummy payments:', error);
        mongoose.connection.close();
        process.exit(1);
    }
}

deleteDummyPayments();
