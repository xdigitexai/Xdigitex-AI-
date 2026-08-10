---
name: M-Pesa Integration
keywords:
  - mpesa
  - m-pesa
  - daraja
  - safaricom
  - stk push
  - paybill
  - till number
  - mobile money
  - kenya
  - payment
  - daraja api
  - c2b
  - b2c
  - mpesa express
  - lipa na mpesa
  - callback
category: payments
priority: 8
version: 1.0
author: Xdigitex
---

# M-Pesa Integration Expert

## Rules
- Always use sandbox (`sandbox.safaricom.co.ke`) for testing — never real credentials in dev.
- Callback URLs MUST be public HTTPS — localhost will not work.
- STK Push has a 3-minute expiry — poll for result or wait for callback.
- Never expose Consumer Key/Secret in frontend code.
- Always validate the callback signature before processing payments.
- Log every callback raw payload for dispute resolution.

## Daraja API — Auth
```javascript
// Get OAuth token
const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString("base64");
const res = await fetch("https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials", {
  headers: { Authorization: `Basic ${auth}` },
});
const { access_token } = await res.json();
```

## STK Push (Lipa Na M-Pesa)
```javascript
const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
const password  = Buffer.from(`${SHORTCODE}${PASSKEY}${timestamp}`).toString("base64");

const res = await fetch("https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest", {
  method: "POST",
  headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    BusinessShortCode: SHORTCODE,
    Password: password,
    Timestamp: timestamp,
    TransactionType: "CustomerPayBillOnline",   // or CustomerBuyGoodsOnline for till
    Amount: 1,
    PartyA: "254712345678",    // customer phone
    PartyB: SHORTCODE,
    PhoneNumber: "254712345678",
    CallBackURL: "https://yourdomain.com/api/mpesa/callback",
    AccountReference: "ORDER-001",
    TransactionDesc: "Payment for order",
  }),
});
```

## Callback Handler
```javascript
app.post("/api/mpesa/callback", (req, res) => {
  const body = req.body;
  const stkCallback = body?.Body?.stkCallback;
  const ResultCode = stkCallback?.ResultCode;

  if (ResultCode === 0) {
    const items = stkCallback.CallbackMetadata.Item;
    const amount    = items.find(i => i.Name === "Amount")?.Value;
    const mpesaRef  = items.find(i => i.Name === "MpesaReceiptNumber")?.Value;
    const phone     = items.find(i => i.Name === "PhoneNumber")?.Value;
    // Mark order as paid in DB
  } else {
    // Payment failed — ResultDesc has reason
    console.log("Payment failed:", stkCallback?.ResultDesc);
  }
  res.json({ ResultCode: 0, ResultDesc: "Accepted" });
});
```

## Environment Variables Needed
```
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_SHORTCODE=174379
MPESA_PASSKEY=...
MPESA_ENV=sandbox   # or production
```

## Production Endpoints
- Sandbox: `https://sandbox.safaricom.co.ke`
- Production: `https://api.safaricom.co.ke`
