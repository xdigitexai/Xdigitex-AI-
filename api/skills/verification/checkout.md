---
name: Checkout & Payments
keywords:
  - checkout
  - payment
  - pay
  - buy
  - purchase
  - cart
  - stripe
  - mpesa
  - m-pesa
  - daraja
  - order
  - invoice
  - billing
  - subscription
  - pricing page
  - upgrade plan
  - payment form
  - credit card
category: verification
priority: 10
needs_auth: true
can_self_register: true
steps:
  - pricing_page_loads|Pricing/checkout page loads (HTTP 200)
  - plan_options_visible|Plan options or product prices displayed correctly
  - payment_form_loads|Payment form renders (Stripe elements, M-Pesa input, etc.)
  - test_payment_accepted|Test payment completes without error (use sandbox/test mode)
  - success_page_shown|Success confirmation shown after payment
  - account_upgraded|User account reflects upgraded plan/credits after payment
  - webhook_processed|Payment webhook received and processed (if applicable) [optional]
  - no_console_errors|No JS errors during checkout flow
---

## Checkout Verification Mission

You are verifying the payment/checkout flow works end-to-end using TEST mode.

⚠️ ALWAYS use test credentials — NEVER trigger real charges.

### Steps in order

1. **Navigate to pricing or checkout page** — confirm it loads (HTTP 200)
2. **Select a plan/product** — confirm price is displayed correctly
3. **Open payment form** — Stripe Elements should render card fields, or M-Pesa phone field
4. **Enter test credentials**:
   - Stripe test card: `4242 4242 4242 4242`, expiry `12/26`, CVV `123`
   - M-Pesa sandbox: use Safaricom sandbox phone numbers
5. **Screenshot BEFORE submit** — confirm form is filled
6. **Submit payment** — click pay/purchase button
7. **Screenshot AFTER submit** — should show success or spinner
8. **Verify account updated** — check DB or API: plan/credits/subscription reflects payment
9. **Check webhook** — confirm webhook endpoint received the event (check logs)

### Common failure patterns

- **Stripe Elements not loading** → check `STRIPE_PUBLISHABLE_KEY` in env
- **Payment succeeds but account not updated** → webhook not configured or failing
- **M-Pesa STK push not sent** → check `MPESA_CONSUMER_KEY` and callback URL is public HTTPS
- **CORS error on payment API** → check server CORS configuration

### Evidence to collect

- Screenshot of checkout page
- Screenshot of success/confirmation page
- HTTP status of payment intent/STK push endpoint
- DB query showing account was upgraded (or failure reason)
