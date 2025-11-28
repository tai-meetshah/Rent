# Testing Refund Webhook

## Method 1: Using Stripe CLI (Easiest for Local Testing)

### Step 1: Start Webhook Listener
```bash
stripe listen --forward-to localhost:5000/api/payment/webhook
```

Copy the webhook secret and update your `.env`:
```
STRIPE_WEBHOOK_SECRET2=whsec_xxxxx
```

### Step 2: Trigger Refund Event
In a new terminal:
```bash
# Trigger a successful refund
stripe trigger refund.updated

# Or trigger with specific status
stripe trigger refund.succeeded
stripe trigger refund.failed
```

### Step 3: Check Your Console
You should see:
```
===================================
Refund status updated: re_xxxxx
===================================
Refund succeeded: re_xxxxx
```

---

## Method 2: Test with Real Refund Flow

### Step 1: Create a Test Payment
1. Create a booking and payment in your app
2. Complete the payment with test card: `4242 4242 4242 4242`

### Step 2: Trigger a Refund via Your API

**Option A: Test Deposit Refund**
```bash
# Call your payout endpoint (this triggers deposit refund)
curl -X POST http://localhost:5000/api/payment/process-owner-payout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "bookingId": "BOOKING_ID_HERE"
  }'
```

**Option B: Test Cancellation Refund**
```bash
# Cancel a booking (this triggers refund)
curl -X POST http://localhost:5000/api/payment/cancel-booking \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "bookingId": "BOOKING_ID_HERE",
    "cancelledBy": "renter",
    "cancellationReason": "Testing refund webhook"
  }'
```

### Step 3: Wait for Webhook
- Stripe will process the refund (usually instant for test mode)
- Stripe will send `refund.updated` webhook to your endpoint
- Check your server console for logs

---

## Method 3: Manual Refund from Stripe Dashboard

### Step 1: Go to Stripe Dashboard
https://dashboard.stripe.com/test/payments

### Step 2: Find a Payment
1. Click on any successful payment
2. Click "Refund payment"
3. Enter refund amount
4. Add metadata:
   ```
   bookingId: YOUR_BOOKING_ID
   paymentId: YOUR_PAYMENT_ID
   ```
5. Click "Refund"

### Step 3: Check Webhook Logs
Stripe Dashboard → Webhooks → Your endpoint → View recent events

---

## How to Verify It's Working

### 1. Check Server Console Logs
You should see these logs:
```
===================================
Refund status updated: re_xxxxx
===================================
Refund succeeded: re_xxxxx
Refund for booking 67xxxxx processed successfully.
```

### 2. Check Database
```javascript
// Check if payment was updated
db.payments.findOne({ _id: PAYMENT_ID })
// Should see:
// - depositRefunded: true
// - depositRefundedAt: Date

// Check if booking was updated
db.bookings.findOne({ _id: BOOKING_ID })
// Should see:
// - refundStatus: 'refund_completed'
```

### 3. Check User Notifications
- The renter should receive a push notification: "Deposit Refunded"
- Check `usernotifications` collection for the notification

### 4. Check Stripe Dashboard Logs
1. Go to: https://dashboard.stripe.com/test/webhooks
2. Click on your webhook endpoint
3. Check recent webhook events
4. Look for `refund.updated` events
5. Check if they succeeded or failed

---

## Expected Flow

### Complete Flow When Deposit Refund Happens:

1. **Admin/System calls** `processOwnerPayout()` endpoint

2. **Your server creates refund** via Stripe API:
   ```javascript
   stripe.refunds.create({ ... })
   ```

3. **Stripe processes refund** (instant in test mode)

4. **Stripe sends webhook** to `/api/payment/webhook`:
   ```json
   {
     "type": "refund.updated",
     "data": {
       "object": {
         "id": "re_xxxxx",
         "status": "succeeded",
         "metadata": {
           "bookingId": "...",
           "paymentId": "..."
         }
       }
     }
   }
   ```

5. **Your webhook handler** (lines 711-783) processes it:
   - Updates `payment.depositRefunded = true`
   - Updates `booking.refundStatus = 'refund_completed'`
   - Sends notification to renter

6. **User receives notification**: "Your deposit has been refunded"

---

## Troubleshooting

### Not Receiving Webhooks?

**Check 1: Webhook Endpoint Configured in Stripe**
- Go to: https://dashboard.stripe.com/test/webhooks
- Ensure your endpoint is added
- Ensure `refund.updated` event is selected

**Check 2: Correct Webhook Secret**
- Copy signing secret from Stripe Dashboard
- Update `STRIPE_WEBHOOK_SECRET2` in `.env`
- Restart server

**Check 3: Server is Reachable**
- For local testing, use Stripe CLI
- For production, ensure your server is publicly accessible

**Check 4: Check Webhook Logs in Stripe**
- Go to webhook endpoint in Stripe Dashboard
- Click on failed events
- Check error messages

### Webhook Received but Code Not Working?

**Check 1: Metadata is Present**
```javascript
console.log('Refund metadata:', refund.metadata);
// Should have: bookingId, paymentId
```

**Check 2: IDs are Valid**
```javascript
console.log('Looking for payment:', paymentId);
const payment = await Payment.findById(paymentId);
console.log('Found payment:', payment ? 'Yes' : 'No');
```

**Check 3: Check Error Logs**
- Look for any errors in server console
- Check if notification service is working

---

## Quick Test Script

Save this as `test-refund.js`:

```javascript
const stripe = require('./config/stripe');

async function testRefund() {
  try {
    // 1. Create a test payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 10000, // $100
      currency: 'aud',
      payment_method: 'pm_card_visa',
      confirm: true,
      return_url: 'https://example.com/return',
      metadata: {
        bookingId: 'test_booking_123',
        paymentId: 'test_payment_123',
      },
    });

    console.log('Payment created:', paymentIntent.id);
    console.log('Charge:', paymentIntent.latest_charge);

    // 2. Create a refund
    const refund = await stripe.refunds.create({
      charge: paymentIntent.latest_charge,
      amount: 5000, // $50
      metadata: {
        bookingId: 'test_booking_123',
        paymentId: 'test_payment_123',
      },
    });

    console.log('Refund created:', refund.id);
    console.log('Refund status:', refund.status);
    console.log('Wait for webhook to be called...');

  } catch (error) {
    console.error('Error:', error.message);
  }
}

testRefund();
```

Run with:
```bash
node test-refund.js
```
