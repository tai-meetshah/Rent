# Stripe Connect Integration Guide

## Overview
This document explains how to integrate Stripe Connect for seller payouts in the rental marketplace.

## Backend Setup Complete ✅

### 1. User Model Updates
The User model now includes:
- `stripeConnectAccountId` - Stripe Connect account ID
- `stripeAccountStatus` - Account verification status (not_started, pending, verified, restricted, rejected)
- `stripeOnboardingComplete` - Boolean indicating if onboarding is complete
- `stripeChargesEnabled` - Can accept charges
- `stripePayoutsEnabled` - Can receive payouts
- `stripeDetailsSubmitted` - Has submitted all required details

### 2. API Endpoints

#### Create Stripe Connect Account
```http
POST /api/payment/stripe-connect/create-account
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Stripe Connect account created. Please complete onboarding.",
  "url": "https://connect.stripe.com/setup/...",
  "accountId": "acct_xxxxx"
}
```

**Frontend Action:** Redirect user to the `url` to complete Stripe onboarding.

---

#### Get Account Status
```http
GET /api/payment/stripe-connect/account-status
Authorization: Bearer <token>
```

**Response (Not Connected):**
```json
{
  "success": true,
  "connected": false,
  "status": "not_started",
  "message": "No Stripe account connected."
}
```

**Response (Connected & Verified):**
```json
{
  "success": true,
  "connected": true,
  "accountId": "acct_xxxxx",
  "status": "verified",
  "chargesEnabled": true,
  "payoutsEnabled": true,
  "detailsSubmitted": true,
  "requirements": {
    "currentlyDue": [],
    "errors": [],
    "pendingVerification": []
  },
  "onboardingComplete": true
}
```

---

#### Get Account Balance
```http
GET /api/payment/stripe-connect/balance
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "balance": {
    "available": 150.50,
    "pending": 75.25,
    "currency": "aud"
  }
}
```

---

#### Create Account Link (Re-onboarding)
```http
POST /api/payment/stripe-connect/create-account-link
Authorization: Bearer <token>
```

Use this if the user needs to update their details or complete missing requirements.

---

### 3. Environment Variables Required

Add these to your `.env` file:

```env
# Existing Stripe variables
STRIPE_SECRET_KEY=sk_test_xxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx

# New Stripe Connect webhook secret
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_xxxxx

# Frontend URL for redirect
FRONTEND_URL=http://localhost:3000
```

---

### 4. Webhook Configuration

You need to configure TWO webhooks in Stripe Dashboard:

#### Webhook 1: Regular Payments
**Endpoint:** `https://yourdomain.com/api/payment/webhook`
**Events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `refund.updated`
- `charge.refunded`

#### Webhook 2: Stripe Connect
**Endpoint:** `https://yourdomain.com/api/payment/stripe-connect/webhook`
**Events:**
- `account.updated`
- `account.external_account.created`
- `account.external_account.deleted`

---

## Frontend Implementation

### Example: React/React Native Integration

#### 1. Payment Settings Page

```jsx
import React, { useEffect, useState } from 'react';
import axios from 'axios';

const PaymentSettings = () => {
  const [accountStatus, setAccountStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAccountStatus();
  }, []);

  const checkAccountStatus = async () => {
    try {
      const response = await axios.get('/api/payment/stripe-connect/account-status', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAccountStatus(response.data);
    } catch (error) {
      console.error('Error fetching account status:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectStripeAccount = async () => {
    try {
      const response = await axios.post('/api/payment/stripe-connect/create-account', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Redirect to Stripe onboarding
      window.location.href = response.data.url;
    } catch (error) {
      console.error('Error connecting Stripe:', error);
      alert('Failed to connect Stripe account');
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div className="payment-settings">
      <h2>Payment Settings</h2>

      {!accountStatus.connected ? (
        <div className="not-connected">
          <p>⚠️ You need to connect your payment account to receive payouts.</p>
          <button onClick={connectStripeAccount}>
            Connect Stripe Account
          </button>
        </div>
      ) : (
        <div className="connected">
          <h3>✅ Payment Account Connected</h3>
          <p>Status: {accountStatus.status}</p>
          <p>Payouts Enabled: {accountStatus.payoutsEnabled ? 'Yes' : 'No'}</p>

          {accountStatus.requirements.currentlyDue.length > 0 && (
            <div className="requirements">
              <p>⚠️ Additional information required:</p>
              <ul>
                {accountStatus.requirements.currentlyDue.map(req => (
                  <li key={req}>{req}</li>
                ))}
              </ul>
              <button onClick={connectStripeAccount}>
                Complete Setup
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PaymentSettings;
```

---

#### 2. Account Balance Display

```jsx
const AccountBalance = () => {
  const [balance, setBalance] = useState(null);

  useEffect(() => {
    fetchBalance();
  }, []);

  const fetchBalance = async () => {
    try {
      const response = await axios.get('/api/payment/stripe-connect/balance', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBalance(response.data.balance);
    } catch (error) {
      console.error('Error fetching balance:', error);
    }
  };

  if (!balance) return null;

  return (
    <div className="balance-card">
      <h3>Your Balance</h3>
      <div className="available">
        <span>Available:</span>
        <strong>${balance.available.toFixed(2)} {balance.currency.toUpperCase()}</strong>
      </div>
      <div className="pending">
        <span>Pending:</span>
        <span>${balance.pending.toFixed(2)} {balance.currency.toUpperCase()}</span>
      </div>
    </div>
  );
};
```

---

#### 3. Handle Return from Stripe Onboarding

When users complete Stripe onboarding, they're redirected to:
```
http://localhost:3000/settings/payment?success=true
```

Handle this in your component:

```jsx
useEffect(() => {
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.get('success') === 'true') {
    // User completed onboarding
    showSuccessMessage('Payment account connected successfully!');
    checkAccountStatus(); // Refresh status
  } else if (urlParams.get('refresh') === 'true') {
    // User needs to refresh/retry
    showInfoMessage('Please complete your payment setup.');
    connectStripeAccount(); // Regenerate link
  }
}, []);
```

---

## Payment Flow

### Complete Flow with Stripe Connect:

1. **Renter Books Product**
   - Payment of Rental + Deposit charged via Stripe
   - Funds held in your platform's Stripe account

2. **Rental Period**
   - Product used by renter

3. **Renter Returns Product**
   - Uploads return photos via API

4. **Owner Reviews Photos** (or Admin)
   - Calls `/api/booking/review-return-photo`
   - If all photos approved:
     - ✅ **Deposit refunded** to renter's card
     - ✅ **Rental amount (minus commission) transferred** to owner's Stripe Connect account
     - ✅ Booking marked as completed

### Important Notes:

- ⚠️ **Owner must have verified Stripe Connect account** before payout can be processed
- ⚠️ If owner doesn't have account, payout will fail with error message
- ⚠️ Commission is automatically deducted before transfer
- ⚠️ Transfers typically arrive in 2-7 business days (standard) or instantly (for additional fee)

---

## Testing

### Test Mode Setup:

1. Use Stripe test keys
2. Create test Connect accounts
3. Use test bank accounts from Stripe docs:
   - **Test BSB:** 000-000
   - **Test Account:** 000123456

### Test Cards:
- **Success:** 4242 4242 4242 4242
- **Decline:** 4000 0000 0000 0002

---

## Security Considerations

✅ **What's Secure:**
- No bank details stored in your database
- Stripe handles all sensitive data
- PCI compliance managed by Stripe
- Built-in fraud detection

❌ **What to Avoid:**
- Don't store `stripeConnectAccountId` without encryption (though it's not super sensitive)
- Don't expose Stripe secret keys in frontend
- Always validate webhook signatures

---

## Common Issues & Solutions

### Issue: "Owner has not set up their payment account"
**Solution:** Owner needs to connect their Stripe account via payment settings.

### Issue: "Owner payment account is not fully set up"
**Solution:** Owner needs to complete all required information in Stripe onboarding.

### Issue: Webhook not receiving events
**Solution:**
1. Check webhook URL is correct
2. Verify webhook secret in `.env`
3. Check Stripe Dashboard for failed webhook attempts

### Issue: Transfer failed
**Solution:**
1. Verify owner's account is verified (`stripePayoutsEnabled: true`)
2. Check Stripe Dashboard for transfer error details
3. Ensure sufficient balance in platform account

---

## Support

For Stripe-specific issues:
- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [Stripe Support](https://support.stripe.com/)

For implementation issues:
- Check server logs for detailed error messages
- Verify all environment variables are set
- Test with Stripe test mode first
