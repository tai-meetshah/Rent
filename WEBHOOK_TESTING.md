# Stripe Webhook Testing Guide

## Testing Locally with Stripe CLI

### 1. Install Stripe CLI
Download from: https://stripe.com/docs/stripe-cli

### 2. Login to Stripe
```bash
stripe login
```

### 3. Forward Webhooks to Local Server

#### For Payment Webhook:
```bash
stripe listen --forward-to localhost:5000/api/payment/webhook
```

This will output something like:
```
> Ready! Your webhook signing secret is whsec_xxx (^C to quit)
```

**Copy this secret and use it as `STRIPE_WEBHOOK_SECRET2` in your `.env` file**

#### For Connect Webhook:
```bash
stripe listen --forward-to localhost:5000/api/payment/stripe-connect/webhook
```

**Copy this secret and use it as `STRIPE_WEBHOOK_SECRET1` in your `.env` file**

### 4. Trigger Test Events

In a new terminal, trigger test events:

```bash
# Test payment success
stripe trigger payment_intent.succeeded

# Test subscription created
stripe trigger customer.subscription.created

# Test invoice payment succeeded
stripe trigger invoice.payment_succeeded
```

## Webhook Endpoints Configuration

Your application has two webhook endpoints:

1. **Main Payment Webhook**: `https://yourdomain.com/api/payment/webhook`
   - Handles: payment_intent, refunds, subscriptions, invoices
   - Uses: `STRIPE_WEBHOOK_SECRET2`

2. **Stripe Connect Webhook**: `https://yourdomain.com/api/payment/stripe-connect/webhook`
   - Handles: account.updated, external accounts
   - Uses: `STRIPE_WEBHOOK_SECRET1`

## Troubleshooting

### Error: "No signatures found matching the expected signature"

**Cause**: The webhook signing secret in your `.env` doesn't match Stripe's signing secret.

**Fix**:
1. Go to Stripe Dashboard → Webhooks
2. Click on your webhook endpoint
3. Reveal and copy the signing secret
4. Update your `.env` file with the correct secret
5. Restart your server

### Error: "Webhook signature verification failed"

**Cause**: The request body is being modified before reaching the webhook handler.

**Fix**: Ensure `express.raw()` middleware is applied BEFORE `express.json()` (already correctly set up in your app.js:45-54)

## Production Setup

For production, create webhooks in Stripe Dashboard:

1. Go to: https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. Enter your production URL:
   - Main: `https://yourdomain.com/api/payment/webhook`
   - Connect: `https://yourdomain.com/api/payment/stripe-connect/webhook`
4. Select events to listen to
5. Copy the signing secret and add to your production environment variables

## Events Currently Handled

### Main Payment Webhook (`/api/payment/webhook`):
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `refund.updated`
- `charge.refunded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

### Connect Webhook (`/api/payment/stripe-connect/webhook`):
- `account.updated`
- `account.external_account.created`
- `account.external_account.deleted`
