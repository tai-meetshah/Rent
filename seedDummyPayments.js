const mongoose = require('mongoose');
require('dotenv').config();

// Use the actual Payment model
const Payment = require('./models/paymentModel');

async function seedDummyPayments() {
    try {
        console.log('Connecting to MongoDB...');

        // Connect to MongoDB
        await mongoose.connect(process.env.DATABASE, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('Connected! Starting to seed dummy payment data...');

        // Get some existing IDs from your database (we'll use dummy ObjectIds)
        const dummyUserId = new mongoose.Types.ObjectId();
        const dummyProductId = new mongoose.Types.ObjectId();
        const dummyBookingId = new mongoose.Types.ObjectId();

        const dummyPayments = [];
        const now = new Date();

        // Create payments for the last 12 months
        for (let i = 11; i >= 0; i--) {
            const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 15);

            // Create 3-5 random payments for each month
            const paymentsPerMonth = Math.floor(Math.random() * 3) + 3;

            for (let j = 0; j < paymentsPerMonth; j++) {
                const rentalAmount = Math.floor(Math.random() * 500) + 100; // $100-$600
                const depositAmount = rentalAmount * 0.2;
                const totalAmount = rentalAmount + depositAmount;
                const commissionRate = 0.15; // 15% commission
                const commissionAmount = totalAmount * commissionRate;
                const ownerPayoutAmount = totalAmount - commissionAmount;

                dummyPayments.push({
                    booking: new mongoose.Types.ObjectId(),
                    renter: dummyUserId,
                    owner: dummyUserId,
                    product: dummyProductId,
                    totalAmount: totalAmount,
                    rentalAmount: rentalAmount,
                    commissionAmount: commissionAmount,
                    ownerPayoutAmount: ownerPayoutAmount,
                    depositAmount: depositAmount,
                    paymentStatus: 'paid',
                    commissionType: 'percentage',
                    commissionPercentage: commissionRate * 100,
                    currency: 'AUD',
                    createdAt: new Date(
                        monthDate.getFullYear(),
                        monthDate.getMonth(),
                        Math.floor(Math.random() * 28) + 1, // Random day in month
                        Math.floor(Math.random() * 24), // Random hour
                        Math.floor(Math.random() * 60)  // Random minute
                    ),
                });
            }
        }

        // Insert the dummy payments one by one to catch validation errors
        console.log(`Preparing to insert ${dummyPayments.length} payments...`);

        let successCount = 0;
        for (const payment of dummyPayments) {
            try {
                await Payment.create(payment);
                successCount++;
            } catch (err) {
                console.error('Error inserting payment:', err.message);
            }
        }

        console.log(`✓ Successfully inserted ${successCount} dummy payments`);
        console.log('Breakdown by month:');

        // Show summary
        const summary = {};
        dummyPayments.forEach(p => {
            const monthYear = `${p.createdAt.getMonth() + 1}/${p.createdAt.getFullYear()}`;
            if (!summary[monthYear]) {
                summary[monthYear] = { count: 0, total: 0 };
            }
            summary[monthYear].count++;
            summary[monthYear].total += p.totalAmount;
        });

        Object.keys(summary).sort().forEach(monthYear => {
            console.log(`  ${monthYear}: ${summary[monthYear].count} payments, $${summary[monthYear].total.toFixed(2)} total`);
        });

        mongoose.connection.close();
        console.log('\n✓ Done! You can now check the reports page to see the revenue trend.');

    } catch (error) {
        console.error('Error seeding dummy payments:', error);
        mongoose.connection.close();
        process.exit(1);
    }
}

seedDummyPayments();
