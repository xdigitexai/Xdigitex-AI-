---
name: Registration & Signup
keywords:
  - register
  - registration
  - signup
  - sign up
  - create account
  - new account
  - onboarding
  - user creation
  - invite
category: verification
priority: 9
needs_auth: false
can_self_register: true
steps:
  - register_page_loads|Registration page loads (HTTP 200)
  - form_fields_visible|Name, email, password fields visible
  - validation_works|Empty/invalid submission shows validation errors
  - submit_creates_account|Valid submission creates account (HTTP 201 or redirect)
  - email_sent|Confirmation email sent (if required) [optional]
  - login_after_register|Can login immediately after registration
  - console_clean|No JS errors during registration flow
---

## Registration Verification Mission

You are verifying that new users can register and access the system.

### Steps in order

1. **Open registration page** — confirm HTTP 200, form visible
2. **Test validation** — submit empty form, confirm error messages appear
3. **Fill valid details** — use `test_$(date +%s)@verify.xdigitex.com` as email
4. **Screenshot BEFORE submit** — confirm all fields are filled
5. **Submit** — click register/sign up
6. **Screenshot AFTER submit** — should see success message or dashboard
7. **Attempt login** with the new credentials — confirm it works
8. **Clean up** — delete the test account via admin panel, API, or DB query

### Common failure patterns

- **Duplicate email error** → use timestamp in email address to ensure uniqueness
- **Database constraint error** → check migration status
- **Email not sent** → SMTP config missing; check `.env` for MAIL_* vars
- **Password validation too strict** → check min-length, special char requirements in error message

### Evidence to collect

- Screenshot of registration form
- Screenshot of success/redirect state
- HTTP status of registration endpoint
- Confirmation the test account was deleted
