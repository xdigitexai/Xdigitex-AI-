---
name: Stripe Payments
keywords:
  - stripe
  - payment
  - checkout
  - subscription
  - webhook
  - payment intent
  - card
  - billing
  - invoice
  - stripe api
  - credit card
  - payment gateway
category: payments
priority: 8
version: 1.0
author: Xdigitex
---

# Stripe Payments Expert

## Rules
- Always use Stripe's webhook signature verification — never skip it.
- Never log full card data — Stripe tokenizes it before it reaches your server.
- Use `stripe listen --forward-to` locally for webhook testing.
- Idempotency keys prevent double-charges on retry — always use them.
- Use test key `sk_test_...` for development; switch to `sk_live_...` only in production.

## Create Payment Intent (Node.js)
```javascript
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const paymentIntent = await stripe.paymentIntents.create({
  amount: 2000,                   // in cents — $20.00
  currency: "usd",
  automatic_payment_methods: { enabled: true },
  idempotency_key: `order-${orderId}`,
  metadata: { userId, orderId },
});
// Return paymentIntent.client_secret to frontend
```

## Webhook Handler
```javascript
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  switch (event.type) {
    case "payment_intent.succeeded":
      const pi = event.data.object;
      // Fulfill order using pi.metadata.orderId
      break;
    case "payment_intent.payment_failed":
      // Notify customer
      break;
    case "customer.subscription.deleted":
      // Downgrade user
      break;
  }

  res.json({ received: true });
});
```

## Subscriptions
```javascript
// Create subscription
const sub = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: "price_..." }],
  expand: ["latest_invoice.payment_intent"],
});

// Cancel subscription
await stripe.subscriptions.cancel(subscriptionId);
```

## Environment Variables
```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Testing
```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
stripe trigger payment_intent.succeeded   # test event
```
