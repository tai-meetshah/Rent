# Stripe Connect Setup Checklist

## ✅ Backend Implementation Complete

The following has been implemented:

### 1. Database Schema
- [x] Added Stripe Connect fields to User model ([userModel.js:75-105](d:\@Project\Rent\models\userModel.js#L75-L105))
  - `stripeConnectAccountId`
  - `stripeAccountStatus`
  - `stripeOnboardingComplete`
  - `stripeChargesEnabled`
  - `stripePayoutsEnabled`
  - `stripeDetailsSubmitted`

### 2. API Endpoints
- [x] Created Stripe Connect routes ([paymentRoutes.js:54-89](d:\@Project\Rent\routes\api\paymentRoutes.js#L54-L89))
  - POST `/api/payment/stripe-connect/create-account`
  - GET `/api/payment/stripe-connect/account-status`
  - POST `/api/payment/stripe-connect/create-account-link`
  - GET `/api/payment/stripe-connect/balance`
  - POST `/api/payment/stripe-connect/webhook`

### 3. Controller Functions
- [x] Implemented Stripe Connect handlers ([paymentController.js:895-1164](d:\@Project\Rent\controllers\api\paymentController.js#L895-L1164))
  - `createStripeConnectAccount()`
  - `getStripeConnectAccountStatus()`
  - `createStripeConnectAccountLink()`
  - `getStripeConnectBalance()`
  - `stripeConnectWebhook()`

### 4. Payment Flow
- [x] Updated `reviewReturnPhoto` to transfer funds ([bookingController.js:763-833](d:\@Project\Rent\controllers\api\bookingController.js#L763-L833))
  - Validates owner has Stripe Connect account
  - Checks account is verified and enabled for payouts
  - Transfers rental amount (minus commission) to owner
  - Handles transfer failures gracefully

---

## 🔧 Required Configuration Steps

### Step 1: Update Environment Variables

Add to your `.env` file:

```bash
# Stripe Connect Webhook Secret (create this in Stripe Dashboard)
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxx

# Frontend URL for redirects
FRONTEND_URL=http://localhost:3000  # or your production URL
```

**Where to find these:**
1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** > **Webhooks**
3. Click **Add endpoint**
4. Enter URL: `https://yourdomain.com/api/payment/stripe-connect/webhook`
5. Select events:
   - `account.updated`
   - `account.external_account.created`
   - `account.external_account.deleted`
6. Copy the webhook signing secret → `STRIPE_CONNECT_WEBHOOK_SECRET`

---

### Step 2: Verify Existing Stripe Configuration

Ensure these are already in your `.env`:

```bash
STRIPE_SECRET_KEY=sk_test_xxxxx  # or sk_live_xxxxx for production
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx  # For payment webhooks
```

---

### Step 3: Test the Integration

#### Using Postman/Insomnia:

**1. Create Stripe Connect Account**
```http
POST http://localhost:5000/api/payment/stripe-connect/create-account
Authorization: Bearer YOUR_JWT_TOKEN
```

Expected Response:
```json
{
  "success": true,
  "url": "https://connect.stripe.com/setup/...",
  "accountId": "acct_xxxxx"
}
```

**2. Check Account Status**
```http
GET http://localhost:5000/api/payment/stripe-connect/account-status
Authorization: Bearer YOUR_JWT_TOKEN
```

**3. Get Balance**
```http
GET http://localhost:5000/api/payment/stripe-connect/balance
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### Step 4: Frontend Integration

**Required Pages/Components:**

1. **Payment Settings Page**
   - Show Stripe Connect status
   - Button to connect/setup Stripe account
   - Display verification status and requirements

2. **Seller Dashboard**
   - Show account balance
   - Display payout history
   - Alert if payment setup is incomplete

3. **Product Listing Flow**
   - Warn sellers if they try to list products without payment setup
   - Prompt to connect Stripe before accepting bookings

**Sample Implementation:** See [STRIPE_CONNECT_INTEGRATION.md](d:\@Project\Rent\STRIPE_CONNECT_INTEGRATION.md)

---

## 🚨 Important Notes

### Before Going Live:

1. **Switch to Live Mode**
   - Update `.env` with live Stripe keys (`sk_live_`, `pk_live_`)
   - Create webhooks in live mode
   - Test with real bank accounts

2. **Platform Verification**
   - Stripe may require platform verification for Connect
   - Submit business information in Stripe Dashboard
   - Complete platform profile

3. **Compliance**
   - Ensure Terms of Service mention Stripe Connect
   - Add privacy policy for data handling
   - Comply with local regulations (AML, KYC)

4. **User Communication**
   - Notify existing sellers to connect Stripe accounts
   - Create email templates for onboarding
   - Add help documentation for sellers

---

## 🧪 Testing Checklist

- [ ] Create test Stripe Connect account
- [ ] Complete Stripe onboarding in test mode
- [ ] Verify account status API returns correct data
- [ ] Create a test booking
- [ ] Approve return photos
- [ ] Verify deposit refund processes
- [ ] Verify payout transfers to owner's account
- [ ] Test webhook events are received
- [ ] Test with owner who hasn't connected Stripe (should fail gracefully)
- [ ] Test balance API

---

## 📊 Database Migration

**No migration needed!** The new fields have default values:

```javascript
stripeConnectAccountId: null
stripeAccountStatus: 'not_started'
stripeOnboardingComplete: false
stripeChargesEnabled: false
stripePayoutsEnabled: false
stripeDetailsSubmitted: false
```

Existing users will automatically have these fields with default values.

---

## 🐛 Troubleshooting

### Issue: "Webhook signature verification failed"
**Solution:**
- Check `STRIPE_CONNECT_WEBHOOK_SECRET` in `.env`
- Verify webhook URL in Stripe Dashboard
- Ensure endpoint uses `express.raw({ type: 'application/json' })`

### Issue: "Owner has not set up their payment account"
**Solution:**
- Owner needs to call `/stripe-connect/create-account`
- Redirect owner to Stripe onboarding URL
- Wait for `account.updated` webhook

### Issue: "Transfer failed"
**Solution:**
- Check owner's `stripePayoutsEnabled` is `true`
- Verify platform has sufficient balance
- Check Stripe Dashboard for error details

---

## 📚 Documentation

- [Complete Integration Guide](d:\@Project\Rent\STRIPE_CONNECT_INTEGRATION.md)
- [Stripe Connect Docs](https://stripe.com/docs/connect)
- [Stripe API Reference](https://stripe.com/docs/api)

---

## ✨ Next Steps

1. Update `.env` with required variables
2. Create Stripe Connect webhook in Dashboard
3. Test API endpoints
4. Implement frontend components
5. Test complete payment flow
6. Notify existing sellers to connect accounts
7. Deploy and monitor
