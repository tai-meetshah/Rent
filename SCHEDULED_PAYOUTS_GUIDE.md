# Scheduled Payouts System - Implementation Guide

## 🎯 Overview

The rental marketplace now uses a **15-day scheduled payout system** instead of immediate transfers. This approach:

✅ **Reduces transfer fees** by batching multiple payouts
✅ **Provides dispute window** for chargebacks
✅ **Gives sellers time** to set up payment accounts
✅ **Allows batch processing** of daily payouts

---

## 🔄 How It Works

### Old Flow (Immediate):
```
Return Photos Approved → Deposit Refunded → Money Transferred Immediately
```

### New Flow (Scheduled):
```
Return Photos Approved → Deposit Refunded → Payout Scheduled (15 days)
                                           ↓
                                    Batch Processing (daily)
                                           ↓
                              Multiple Rentals → Single Transfer
```

---

## 📋 What Changed

### 1. Payment Model Updates ([paymentModel.js:87-98](d:\@Project\Rent\models\paymentModel.js#L87-L98))

Added new fields:
```javascript
payoutStatus: {
    type: String,
    enum: ['pending', 'scheduled', 'processing', 'paid', 'failed'],
    default: 'pending',
},
scheduledPayoutDate: Date,      // When payout will be processed
payoutEligibleDate: Date,       // Same as scheduledPayoutDate (15 days)
```

### 2. Updated Return Photo Approval ([bookingController.js:763-801](d:\@Project\Rent\controllers\api\bookingController.js#L763-L801))

When all photos are approved:
- ✅ Deposit is **refunded immediately** to renter
- ✅ Payout is **scheduled for 15 days** from now
- ✅ Seller is notified with scheduled date
- ✅ No immediate transfer is made

### 3. New Batch Payout System

Two ways to process payouts:

#### Option A: Automated Daily Processing (Recommended)
Cron job runs at 2:00 AM every day

#### Option B: Manual Processing via API
Admin can trigger manually anytime

---

## 🚀 Setup Instructions

### Step 1: Install node-cron

```bash
npm install node-cron
```

### Step 2: Initialize Scheduler in Your Server

Update your main server file (e.g., `server.js` or `app.js`):

```javascript
// Add at the top
const { startPayoutScheduler } = require('./jobs/payoutScheduler');

// Add after server starts
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

    // Start the payout scheduler
    startPayoutScheduler();
});
```

**Full Example:**

```javascript
// server.js or app.js
const express = require('express');
const mongoose = require('mongoose');
const { startPayoutScheduler } = require('./jobs/payoutScheduler');

const app = express();
const PORT = process.env.PORT || 5000;

// ... your existing middleware and routes ...

// Start server
mongoose.connect(process.env.MONGO_URI).then(() => {
    console.log('Connected to MongoDB');

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);

        // Initialize automated payout processing
        startPayoutScheduler();
        console.log('✅ Payout scheduler active - runs daily at 2:00 AM');
    });
});
```

---

## 📊 API Endpoints

### 1. Process Batch Payouts (Manual Trigger)

```http
POST /api/payment/batch-payouts/process
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
    "success": true,
    "message": "Batch payout processing complete. 15 successful, 0 failed, 2 skipped.",
    "results": {
        "total": 17,
        "successful": 15,
        "failed": 0,
        "skipped": 2,
        "details": [
            {
                "paymentId": "6789...",
                "ownerId": "1234...",
                "amount": 450.50,
                "status": "success",
                "transferId": "tr_xxxxx"
            }
        ]
    }
}
```

**Use Case:**
Admin wants to trigger payouts before the scheduled time

---

### 2. Get Pending Payouts (Admin Dashboard)

```http
GET /api/payment/batch-payouts/pending
Authorization: Bearer <admin_token>
```

**Response:**
```json
{
    "success": true,
    "summary": {
        "total": 45,
        "readyToProcessCount": 12,
        "awaitingDateCount": 30,
        "missingAccountCount": 3,
        "totals": {
            "readyToProcess": 2450.75,
            "awaitingDate": 8900.00,
            "missingAccount": 350.25
        }
    },
    "payouts": {
        "readyToProcess": [...],    // Can be processed now
        "awaitingDate": [...],       // Scheduled for future dates
        "missingAccount": [...]      // Sellers need to connect Stripe
    }
}
```

**Use Case:**
Admin dashboard showing pending payouts overview

---

## ⏰ Automated Processing

The cron job runs **daily at 2:00 AM** (configurable):

```javascript
// jobs/payoutScheduler.js
cron.schedule('0 2 * * *', async () => {
    // Processes all eligible payouts
}, {
    timezone: 'Australia/Sydney'  // Change to your timezone
});
```

### Customize Schedule:

```javascript
'0 2 * * *'    // Daily at 2:00 AM
'0 */6 * * *'  // Every 6 hours
'0 0 * * 0'    // Weekly on Sunday at midnight
'0 3 * * 1-5'  // Weekdays at 3:00 AM
```

---

## 🔍 Monitoring & Logs

The scheduler logs detailed information:

```
============================================================
Starting automated batch payout processing...
Time: 2025-01-21T02:00:00.000Z
============================================================
Found 17 eligible payouts to process
Processing payouts for 8 owners

Processing owner: John Smith (64a1b2c3...)
  Payments: 3
  Total: AUD $1,250.50
  ✅ Transfer successful: tr_1234567890

Processing owner: Jane Doe (64x9y8z7...)
  Payments: 1
  Total: AUD $85.00
  ⚠️  Owner has no Stripe Connect account - SKIPPED

============================================================
Batch payout processing complete!
  ✅ Successful: 15
  ❌ Failed: 0
  ⚠️  Skipped: 2
  📊 Total: 17
============================================================
```

---

## 💡 Business Logic

### When Payouts Are Scheduled:

1. **Renter returns product** and uploads photos
2. **Owner/Admin approves** all return photos
3. System **refunds deposit** to renter immediately
4. System **schedules payout** for 15 days from approval date
5. Payment status changes to `'scheduled'`

### When Payouts Are Processed:

The automated job finds all payments where:
- `payoutStatus === 'scheduled'`
- `scheduledPayoutDate <= now`

Then **groups by owner** and creates **one transfer per owner** containing all their eligible payouts.

---

## 📱 Seller Notifications

### When Payout is Scheduled:
```
Title: "Payout Scheduled"
Body: "Your payout of AUD $450.50 for Blue Electric Drill
       has been scheduled for February 5, 2025. Commission (10%):
       AUD $50.05. The deposit has been refunded to the renter."
```

### When Payout is Processed:
```
Title: "Payout Processed"
Body: "Your payout of AUD $1,850.75 for 3 rentals has been
       transferred to your account."
```

### If Seller Missing Stripe Account:
```
Title: "Action Required: Connect Payment Account"
Body: "You have 3 pending payouts totaling AUD $850.50.
       Please connect your Stripe account to receive payments."
```

---

## 🧪 Testing

### Test Scheduled Payouts:

```javascript
// 1. Approve return photos for a booking
POST /api/booking/review-return-photo
{
    "bookingId": "...",
    "photoId": "...",
    "action": "approve"
}

// Response will show:
{
    "payoutScheduledFor": "2025-02-05T00:00:00.000Z",
    "payoutStatus": "scheduled"
}

// 2. Check pending payouts
GET /api/payment/batch-payouts/pending

// 3. Manually trigger processing (for testing)
POST /api/payment/batch-payouts/process
```

### Test with Shorter Delay (Development):

Temporarily change the schedule period:

```javascript
// bookingController.js:786
const scheduledPayoutDate = new Date();
scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 15); // Change to 1 for testing
```

---

## 🔧 Configuration Options

### Change Payout Delay Period:

Edit [bookingController.js:786](d:\@Project\Rent\controllers\api\bookingController.js#L786):

```javascript
// 15 days (current)
scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 15);

// 7 days
scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 7);

// 30 days
scheduledPayoutDate.setDate(scheduledPayoutDate.getDate() + 30);
```

### Change Cron Schedule:

Edit [payoutScheduler.js](d:\@Project\Rent\jobs\payoutScheduler.js):

```javascript
cron.schedule('0 2 * * *', ...);  // Current: Daily at 2 AM
```

### Change Timezone:

```javascript
{
    timezone: 'Australia/Sydney'  // Change to your region
    // Options: 'America/New_York', 'Europe/London', 'Asia/Tokyo', etc.
}
```

---

## 📊 Database Queries

### Find all scheduled payouts:
```javascript
db.payments.find({ payoutStatus: 'scheduled' })
```

### Find payouts ready to process:
```javascript
db.payments.find({
    payoutStatus: 'scheduled',
    scheduledPayoutDate: { $lte: new Date() }
})
```

### Find sellers without Stripe accounts who have pending payouts:
```javascript
db.payments.aggregate([
    { $match: { payoutStatus: 'scheduled' } },
    {
        $lookup: {
            from: 'users',
            localField: 'owner',
            foreignField: '_id',
            as: 'ownerData'
        }
    },
    { $unwind: '$ownerData' },
    {
        $match: {
            'ownerData.stripeConnectAccountId': { $exists: false }
        }
    }
])
```

---

## ⚠️ Important Notes

1. **Sellers have 15 days** to connect their Stripe account before payout processing
2. **If seller hasn't connected** Stripe when payout is due, it will be **skipped** and they'll be notified
3. **Multiple rentals** for the same seller are **batched into one transfer** to reduce fees
4. **Deposits are always refunded immediately** - only rental payouts are delayed
5. **Failed transfers** are marked as `'failed'` and can be retried manually

---

## 🆘 Troubleshooting

### Cron Job Not Running:

**Check:**
1. Is `startPayoutScheduler()` called in your server file?
2. Is `node-cron` installed? (`npm install node-cron`)
3. Check server logs for initialization message

### Payouts Not Processing:

**Check:**
1. Are there any payments with `payoutStatus === 'scheduled'`?
2. Is `scheduledPayoutDate` in the past?
3. Does the seller have `stripeConnectAccountId` set?
4. Is `stripePayoutsEnabled === true` for the seller?

### Manual Trigger:

```javascript
// Call directly from console or API
const { triggerManualPayout } = require('./jobs/payoutScheduler');
await triggerManualPayout();
```

---

## 📚 Related Files

- [Payment Model](d:\@Project\Rent\models\paymentModel.js) - Database schema
- [Booking Controller](d:\@Project\Rent\controllers\api\bookingController.js#L763) - Scheduling logic
- [Payment Controller](d:\@Project\Rent\controllers\api\paymentController.js#L1166) - Batch processing
- [Payment Routes](d:\@Project\Rent\routes\api\paymentRoutes.js#L91) - API endpoints
- [Payout Scheduler](d:\@Project\Rent\jobs\payoutScheduler.js) - Cron job

---

## 🎉 Benefits Summary

| Feature | Immediate Transfers | Scheduled Payouts (New) |
|---------|-------------------|-------------------------|
| **Transfer Fees** | High (one per rental) | Low (batched) |
| **Dispute Window** | None | 15 days |
| **Stripe Setup** | Required before rental | Can set up within 15 days |
| **Admin Control** | Limited | Full oversight |
| **Seller Experience** | Fast | Predictable schedule |
| **Platform Cash Flow** | Immediate outflow | Better control |

---

For questions or issues, check the server logs or contact support.
