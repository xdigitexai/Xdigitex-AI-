---
name: Forms & User Input
keywords:
  - form
  - contact form
  - booking form
  - submit form
  - form submission
  - form error
  - validation
  - input
  - textarea
  - file upload
  - captcha
  - email sending
  - form not working
  - form submission failed
category: verification
priority: 8
needs_auth: false
can_self_register: false
steps:
  - form_renders|Form page loads (HTTP 200) and form fields are visible
  - validation_shows_errors|Empty/invalid submission shows user-friendly validation errors
  - valid_submit_accepted|Valid data submits without 500 error
  - success_feedback|User sees success message or redirect after submission
  - data_stored|Submitted data stored in database or sent via email [optional]
  - file_upload_works|File upload accepts valid files [optional]
---

## Form Verification Mission

You are verifying that the form works end-to-end.

### Steps in order

1. **Load the form page** — confirm HTTP 200, form fields visible
2. **Screenshot the form** — show all fields and labels
3. **Test validation** — submit with empty fields; confirm error messages appear
4. **Fill valid test data**:
   - Name: `Test User Verify`
   - Email: `verify_$(date +%s)@test.xdigitex.com`
   - Message: `Automated verification test — please ignore`
5. **Screenshot with filled data** — confirm all fields populated
6. **Submit** — click submit button
7. **Screenshot result** — should show success message, not error page
8. **Check DB / email** — confirm data was stored or email was sent
9. **Check logs** — no unhandled exceptions during submit

### Common failure patterns

- **500 on submit** → backend error; check app logs; usually missing CSRF token or DB error
- **CSRF validation failed** → CSRF token not included in form; check `@csrf` (Laravel) or equivalent
- **Email not sent** → SMTP not configured; check MAIL_* env vars; use `mail.log` or `mailhog`
- **File upload 413** → Nginx/PHP max upload size too small; check `client_max_body_size` and `upload_max_filesize`

### Evidence to collect

- Screenshot of empty form
- Screenshot after submission (success state)
- HTTP status of form submit endpoint
- Confirmation data was stored or email dispatched
