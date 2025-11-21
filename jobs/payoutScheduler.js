// jobs/payoutScheduler.js
const cron = require('node-cron');
const axios = require('axios');
const Payment = require('../models/paymentModel');
const User = require('../models/userModel');
const stripe = require('../config/stripe');
const { sendNotificationsToTokens } = require('../utils/sendNotification');
const userNotificationModel = require('../models/userNotificationModel');

/**
 * Automated Payout Scheduler
 * Runs daily at 2:00 AM to process all scheduled payouts
 */

// Process batch payouts function (can be called directly or via HTTP)
const processBatchPayoutsJob = async () => {
    try {
        console.log('='.repeat(60));
        console.log('Starting automated batch payout processing...');
        console.log('Time:', new Date().toISOString());
        console.log('='.repeat(60));

        const now = new Date();

        // Find all payments that are scheduled and eligible
        const eligiblePayments = await Payment.find({
            payoutStatus: 'scheduled',
            scheduledPayoutDate: { $lte: now },
        })
            .populate('owner', 'name email fcmToken stripeConnectAccountId stripePayoutsEnabled')
            .populate('renter', 'name email')
            .populate('product', 'title')
            .populate('booking');

        console.log(`Found ${eligiblePayments.length} eligible payouts to process`);

        if (eligiblePayments.length === 0) {
            console.log('No payouts to process. Job complete.');
            return {
                success: true,
                message: 'No payouts to process',
                total: 0,
                successful: 0,
                failed: 0,
                skipped: 0,
            };
        }

        const results = {
            total: eligiblePayments.length,
            successful: 0,
            failed: 0,
            skipped: 0,
            details: [],
        };

        // Group payments by owner to batch transfers
        const paymentsByOwner = {};
        for (const payment of eligiblePayments) {
            const ownerId = payment.owner._id.toString();
            if (!paymentsByOwner[ownerId]) {
                paymentsByOwner[ownerId] = [];
            }
            paymentsByOwner[ownerId].push(payment);
        }

        console.log(`Processing payouts for ${Object.keys(paymentsByOwner).length} owners`);

        // Process each owner's payouts
        for (const [ownerId, payments] of Object.entries(paymentsByOwner)) {
            const owner = payments[0].owner;
            const totalPayout = payments.reduce((sum, p) => sum + p.ownerPayoutAmount, 0);

            console.log(`\nProcessing owner: ${owner.name} (${ownerId})`);
            console.log(`  Payments: ${payments.length}`);
            console.log(`  Total: AUD $${totalPayout.toFixed(2)}`);

            // Check if owner has valid Stripe Connect account
            if (!owner.stripeConnectAccountId) {
                console.warn(`  ⚠️  Owner has no Stripe Connect account - SKIPPED`);

                for (const payment of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'No Stripe Connect account',
                    });
                }

                // Notify owner to set up account (once per batch)
                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Action Required: Connect Payment Account',
                        `You have ${payments.length} pending payout${payments.length > 1 ? 's' : ''} totaling AUD $${totalPayout.toFixed(2)}. Please connect your Stripe account to receive payments.`,
                        [owner.fcmToken]
                    );
                    await userNotificationModel.create({
                        sentTo: [owner._id],
                        title: 'Action Required: Connect Payment Account',
                        body: `You have ${payments.length} pending payout${payments.length > 1 ? 's' : ''} totaling AUD $${totalPayout.toFixed(2)}. Please connect your Stripe account to receive payments.`,
                    });
                }
                continue;
            }

            if (!owner.stripePayoutsEnabled) {
                console.warn(`  ⚠️  Owner Stripe account not verified - SKIPPED`);

                for (const payment of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        amount: payment.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'Stripe account not verified',
                    });
                }
                continue;
            }

            // Create a single transfer for all eligible payouts
            try {
                const transfer = await stripe.transfers.create({
                    amount: Math.round(totalPayout * 100),
                    currency: 'aud',
                    destination: owner.stripeConnectAccountId,
                    metadata: {
                        ownerId: ownerId,
                        paymentIds: payments.map(p => p._id.toString()).join(','),
                        paymentCount: payments.length.toString(),
                        batchDate: now.toISOString(),
                        automated: 'true',
                    },
                    description: `Batch payout for ${payments.length} rental${
                        payments.length > 1 ? 's' : ''
                    }`,
                });

                console.log(`  ✅ Transfer successful: ${transfer.id}`);

                // Update all payments for this owner
                for (const payment of payments) {
                    payment.stripeTransferId = transfer.id;
                    payment.payoutStatus = 'paid';
                    payment.payoutAt = now;
                    await payment.save();

                    results.successful++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        productTitle: payment.product.title,
                        amount: payment.ownerPayoutAmount,
                        status: 'success',
                        transferId: transfer.id,
                    });
                }

                // Send notification to owner
                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Payout Processed',
                        `Your payout of AUD $${totalPayout.toFixed(2)} for ${
                            payments.length
                        } rental${
                            payments.length > 1 ? 's' : ''
                        } has been transferred to your account.`,
                        [owner.fcmToken]
                    );

                    await userNotificationModel.create({
                        sentTo: [owner._id],
                        title: 'Payout Processed',
                        body: `Your payout of AUD $${totalPayout.toFixed(2)} for ${
                            payments.length
                        } rental${
                            payments.length > 1 ? 's' : ''
                        } has been transferred to your account.`,
                    });
                }
            } catch (transferError) {
                console.error(`  ❌ Transfer failed:`, transferError.message);

                for (const payment of payments) {
                    payment.payoutStatus = 'failed';
                    await payment.save();

                    results.failed++;
                    results.details.push({
                        paymentId: payment._id,
                        ownerId,
                        productTitle: payment.product.title,
                        amount: payment.ownerPayoutAmount,
                        status: 'failed',
                        error: transferError.message,
                    });
                }

                // Notify owner of failure
                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Payout Failed',
                        `There was an issue processing your payout of AUD $${totalPayout.toFixed(2)}. Please contact support or check your payment account settings.`,
                        [owner.fcmToken]
                    );
                }
            }
        }

        console.log('\n' + '='.repeat(60));
        console.log('Batch payout processing complete!');
        console.log(`  ✅ Successful: ${results.successful}`);
        console.log(`  ❌ Failed: ${results.failed}`);
        console.log(`  ⚠️  Skipped: ${results.skipped}`);
        console.log(`  📊 Total: ${results.total}`);
        console.log('='.repeat(60) + '\n');

        return results;
    } catch (error) {
        console.error('❌ Error in batch payout job:', error);
        throw error;
    }
};

// Schedule the job to run daily at 2:00 AM
const startPayoutScheduler = () => {
    // Cron format: second minute hour day month day-of-week
    // '0 2 * * *' = Every day at 2:00 AM

    const task = cron.schedule(
        '0 2 * * *',
        async () => {
            try {
                await processBatchPayoutsJob();
            } catch (error) {
                console.error('Cron job error:', error);
            }
        },
        {
            scheduled: true,
            timezone: 'Australia/Sydney', // Adjust to your timezone
        }
    );

    console.log('✅ Payout scheduler initialized - will run daily at 2:00 AM (Australia/Sydney)');

    return task;
};

// Allow manual triggering for testing
const triggerManualPayout = async () => {
    console.log('🔧 Manual payout trigger activated');
    return await processBatchPayoutsJob();
};

module.exports = {
    startPayoutScheduler,
    processBatchPayoutsJob,
    triggerManualPayout,
};
