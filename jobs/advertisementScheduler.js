// jobs/advertisementScheduler.js
const cron = require('node-cron');
const Advertisement = require('../models/advertisementModel');
const { sendNotificationsToTokens } = require('../utils/sendNotification');
const userNotificationModel = require('../models/userNotificationModel');

// Run every hour to check for expired advertisements
const checkExpiredAdvertisements = async () => {
    try {
        console.log('Checking for expired advertisements...');
        const now = new Date();

        // Find advertisements that have expired
        const expiredAds = await Advertisement.find({
            status: 'active',
            endDate: { $lt: now },
        }).populate('seller', 'name email fcmToken');

        for (const ad of expiredAds) {
            ad.status = 'completed';
            await ad.save();

            console.log(`Advertisement ${ad._id} marked as completed`);

            // Notify seller
            if (ad.seller && ad.seller.fcmToken) {
                await sendNotificationsToTokens(
                    'Advertisement Completed',
                    `Your advertisement has ended.`,
                    [ad.seller.fcmToken]
                );
                await userNotificationModel.create({
                    sentTo: [ad.seller._id],
                    title: 'Advertisement Completed',
                    body: `Your advertisement campaign has ended.`,
                });
            }
        }

        console.log(`Processed ${expiredAds.length} expired advertisements`);
    } catch (error) {
        console.error('Error checking expired advertisements:', error);
    }
};

// Activate pending advertisements when their start date arrives
const activatePendingAdvertisements = async () => {
    try {
        console.log('Checking for advertisements to activate...');
        const now = new Date();

        const adsToActivate = await Advertisement.find({
            status: 'pending',
            approvalStatus: 'approved',
            paymentStatus: 'paid',
            startDate: { $lte: now },
            endDate: { $gte: now },
        }).populate('seller', 'name email fcmToken');

        for (const ad of adsToActivate) {
            ad.status = 'active';
            await ad.save();

            console.log(`Advertisement ${ad._id} activated`);

            // Notify seller
            if (ad.seller && ad.seller.fcmToken) {
                await sendNotificationsToTokens(
                    'Advertisement Now Live',
                    `Your advertisement is now live and visible to users!`,
                    [ad.seller.fcmToken]
                );
                await userNotificationModel.create({
                    sentTo: [ad.seller._id],
                    title: 'Advertisement Now Live',
                    body: `Your advertisement campaign is now active and visible to all users.`,
                });
            }
        }

        console.log(`Activated ${adsToActivate.length} advertisements`);
    } catch (error) {
        console.error('Error activating advertisements:', error);
    }
};

// Schedule the job to run every hour
const scheduleAdvertisementChecks = () => {
    // Run at every hour
    cron.schedule('0 * * * *', async () => {
        console.log('Running scheduled advertisement checks...');
        await checkExpiredAdvertisements();
        await activatePendingAdvertisements();
    });

    console.log('Advertisement scheduler initialized');
};

// Manual trigger for testing
const triggerManualCheck = async () => {
    console.log('Manual advertisement check triggered');
    await checkExpiredAdvertisements();
    await activatePendingAdvertisements();
};

module.exports = {
    scheduleAdvertisementChecks,
    triggerManualCheck,
};
