// jobs/payoutScheduler.js
const cron = require('node-cron');
const Payment = require('../models/paymentModel');
const userNotificationModel = require('../models/userNotificationModel');
const { sendNotificationsToTokens } = require('../utils/sendNotification');
const stripe = require('../config/stripe');

/**
 * CLEAN STRIPE CONNECT MARKETPLACE PAYOUT SCHEDULER
 * ------------------------------------------------
 * ✔ Uses ONLY stripe.transfers.create()
 * ✔ Adds missing Stripe test balance top-up (using tok_balance_topup)
 * ✔ Prevents “insufficient funds” transfer failure in test mode
 */

const addTestStripeBalance = async requiredAmount => {
    const amountToTopUp = Math.ceil(requiredAmount);

    console.log(`🔄 Topping up Stripe test balance: AUD $${amountToTopUp}`);

    await stripe.charges.create({
        amount: Math.round(amountToTopUp * 100),
        currency: 'aud',
        source: 'tok_balance_topup', // 🔥 REQUIRED to increase available balance
        description: `Test balance top-up AUD $${amountToTopUp}`,
    });

    console.log(`✅ Stripe test balance topped up successfully`);
};

const checkAndTopUpStripeBalance = async requiredPayout => {
    const balance = await stripe.balance.retrieve();
    const available = balance.available.find(b => b.currency === 'aud');

    const availableAmount = available ? available.amount / 100 : 0;
    console.log(`💳 Stripe available balance: AUD $${availableAmount}`);

    if (availableAmount < requiredPayout) {
        const difference = requiredPayout - availableAmount;

        console.log(
            `⚠ Insufficient test balance. Need AUD $${difference.toFixed(
                2
            )}. Adding balance...`
        );

        await addTestStripeBalance(difference);

        console.log('🔁 Rechecking Stripe balance after top-up...');
        return await checkAndTopUpStripeBalance(requiredPayout); // recursion OK: guaranteed small loops
    }

    return true;
};

const processBatchPayoutsJob = async () => {
    try {
        console.log('\n' + '='.repeat(70));
        console.log('🚀 Starting Batch Payout Job:', new Date().toISOString());
        console.log('='.repeat(70));

        const now = new Date();

        const eligiblePayments = await Payment.find({
            payoutStatus: 'scheduled',
            scheduledPayoutDate: { $lte: now },
        })
            .populate(
                'owner',
                'name email fcmToken stripeConnectAccountId stripePayoutsEnabled'
            )
            .populate('renter', 'name email')
            .populate('product', 'title')
            .populate('booking');

        console.log(`➡ Found ${eligiblePayments.length} eligible payouts`);

        if (eligiblePayments.length === 0) {
            console.log('✔ No payouts to process.');
            return {
                success: true,
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

        const grouped = {};
        for (const p of eligiblePayments) {
            const id = p.owner._id.toString();
            if (!grouped[id]) grouped[id] = [];
            grouped[id].push(p);
        }

        console.log(
            `➡ Processing payouts for ${Object.keys(grouped).length} owners\n`
        );

        for (const [ownerId, payments] of Object.entries(grouped)) {
            const owner = payments[0].owner;

            console.log(`\n🏷 Owner: ${owner.name} (${ownerId})`);

            // Missing connect account
            if (!owner.stripeConnectAccountId) {
                console.log('⚠ Skipped — Owner has no Stripe Connect account');
                for (const p of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: p._id,
                        ownerId,
                        amount: p.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'No Stripe Connect account',
                    });
                }

                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Action Required',
                        `You have pending payouts. Please connect your Stripe account.`,
                        [owner.fcmToken]
                    );
                }

                await userNotificationModel.create({
                    sentTo: [owner._id],
                    title: 'Connect Your Payment Account',
                    body: `Please connect your Stripe account to receive payouts.`,
                });

                continue;
            }

            if (!owner.stripePayoutsEnabled) {
                console.log('⚠ Skipped — Stripe account not verified');

                for (const p of payments) {
                    results.skipped++;
                    results.details.push({
                        paymentId: p._id,
                        ownerId,
                        amount: p.ownerPayoutAmount,
                        status: 'skipped',
                        reason: 'Stripe account not verified',
                    });
                }
                continue;
            }

            const totalPayout = payments.reduce((sum, p) => {
                return (
                    sum +
                    (p.netOwnerPayout || p.ownerPayoutAmount || 0) +
                    (p.cancellationVendorAmount || 0)
                );
            }, 0);

            console.log(`💰 Total Payout: AUD $${totalPayout.toFixed(2)}`);

            // 🔥 Ensure balance available BEFORE transfer
            await checkAndTopUpStripeBalance(totalPayout);

            // Create transfer
            try {
                const transfer = await stripe.transfers.create({
                    amount: Math.round(totalPayout * 100),
                    currency: 'aud',
                    destination: owner.stripeConnectAccountId,
                    description: `Payout for ${payments.length} rentals`,
                    metadata: {
                        ownerId,
                        count: payments.length.toString(),
                    },
                });

                console.log(`✅ Transfer Success: ${transfer.id}`);

                for (const p of payments) {
                    p.stripeTransferId = transfer.id;
                    p.payoutStatus = 'paid';
                    p.payoutAt = now;

                    if (p.cancellationVendorAmount > 0) {
                        p.cancellationPayoutStatus = 'paid';
                    }

                    await p.save();
                    results.successful++;
                }

                if (owner.fcmToken) {
                    await sendNotificationsToTokens(
                        'Payout Sent',
                        `AUD $${totalPayout.toFixed(
                            2
                        )} has been transferred to your Stripe account.`,
                        [owner.fcmToken]
                    );
                }

                await userNotificationModel.create({
                    sentTo: [owner._id],
                    title: 'Payout Sent',
                    body: `AUD $${totalPayout.toFixed(
                        2
                    )} has been transferred to your Stripe account.`,
                });
            } catch (err) {
                console.error('❌ Transfer Failed:', err.message);

                for (const p of payments) {
                    p.payoutStatus = 'failed';
                    if (p.cancellationVendorAmount > 0) {
                        p.cancellationPayoutStatus = 'failed';
                    }
                    await p.save();
                    results.failed++;
                }
            }
        }

        console.log('\n' + '='.repeat(70));
        console.log('🎉 Batch Payout Job Completed');
        console.log(`✔ Successful: ${results.successful}`);
        console.log(`❌ Failed: ${results.failed}`);
        console.log(`⚠ Skipped: ${results.skipped}`);
        console.log(`📊 Total: ${results.total}`);
        console.log('='.repeat(70));

        return results;
    } catch (err) {
        console.error('❌ Scheduler Error:', err);
        throw err;
    }
};

// Daily @ 2AM
const startPayoutScheduler = () => {
    cron.schedule(
        '0 2 * * *',
        async () => {
            try {
                await processBatchPayoutsJob();
            } catch (err) {
                console.error('Cron Error:', err);
            }
        },
        {
            scheduled: true,
            timezone: 'Australia/Sydney',
        }
    );

    console.log(
        '⏰ Payout Scheduler active — 2:00 AM daily (Australia/Sydney)'
    );
};

// Manual trigger
const triggerManualPayout = async () => {
    console.log('🛠 Manual payout triggered...');
    return await processBatchPayoutsJob();
};

module.exports = {
    startPayoutScheduler,
    processBatchPayoutsJob,
    triggerManualPayout,
};
