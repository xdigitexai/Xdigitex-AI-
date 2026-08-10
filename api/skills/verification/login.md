---
name: Login & Authentication
keywords:
  - login
  - authentication
  - auth
  - sign in
  - signin
  - password
  - session
  - jwt
  - token
  - logout
  - login page
  - login form
  - fix login
  - login broken
  - cannot login
  - auth issue
  - auth error
category: verification
priority: 10
needs_auth: true
can_self_register: true
steps:
  - login_page_loads|Login page loads (HTTP 200, no server error)
  - form_visible|Email + password fields visible on page
  - submit_accepted|Form submits without frontend errors
  - redirect_dashboard|Successful login redirects to dashboard or home
  - session_active|Session/token is active after login (no 401 on next request)
  - console_clean|No JS errors in browser console after login
  - logout_works|Logout clears session and redirects to login page [optional]
---

## Login Verification Mission

You are verifying that the login flow works end-to-end.

### Steps in order

1. **Navigate to login page** — confirm HTTP 200 and the form renders
2. **Fill credentials** — use the test account email + password
3. **Screenshot BEFORE submit** — confirm fields are filled correctly
4. **Submit the form** — click login/sign-in button
5. **Screenshot AFTER submit** — confirm redirect happened (URL changed)
6. **Verify authenticated state** — check that a protected page (dashboard, profile, etc.) loads without 401
7. **Check console** — no JS errors, no failed network requests
8. **Logout** (optional) — click logout, confirm redirect back to login

### Common failure patterns

- **500 on submit** → check backend logs (`pm2 logs` or `journalctl -u app`); usually DB connection or missing env var
- **Redirect loop** → session misconfiguration; check COOKIE_SECURE vs HTTP
- **401 immediately after login** → JWT secret mismatch or token not stored in cookie/localStorage
- **Form doesn't submit** → JS error before submit handler; check console

### Evidence to collect

- Screenshot of login page
- Screenshot after login (should show dashboard/home)
- HTTP status of `/api/auth/login` or equivalent endpoint
- Any error messages visible on screen
