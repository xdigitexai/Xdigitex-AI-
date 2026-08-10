---
name: REST API & Endpoints
keywords:
  - api
  - rest
  - endpoint
  - route
  - http
  - json
  - request
  - response
  - api error
  - 404 api
  - 500 api
  - api not working
  - webhook
  - curl test
  - postman
  - api integration
category: verification
priority: 9
needs_auth: false
can_self_register: false
steps:
  - health_endpoint|Health check endpoint returns HTTP 200
  - auth_endpoint_works|Authentication endpoint accepts valid credentials (if auth exists)
  - core_crud_read|Core read endpoint returns correct data (HTTP 200 + valid JSON)
  - core_crud_write|Core write endpoint creates/updates data (HTTP 201/200) [optional]
  - invalid_input_rejected|Invalid input returns 400/422 (not 500)
  - unauth_rejected|Unauthenticated request to protected route returns 401/403
  - response_time|Response time is acceptable (< 2000ms for most endpoints) [optional]
---

## REST API Verification Mission

You are verifying that the API endpoints work correctly.

### Steps in order

1. **Health check** — `curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:<PORT>/api/healthz`
2. **List available routes** — check `routes.js` or run `php artisan route:list` (Laravel)
3. **Test auth endpoint** (if exists):
   ```bash
   curl -s -X POST http://localhost:<PORT>/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password"}' | head -200
   ```
4. **Test a core read endpoint** — GET the main resource list, confirm 200 + valid JSON
5. **Test invalid input** — send missing required fields, confirm 400/422 (not 500)
6. **Test auth enforcement** — call a protected endpoint without token, confirm 401/403
7. **Check logs** — confirm no unhandled exceptions in app logs during tests

### Common failure patterns

- **500 on valid input** → server-side error; check `pm2 logs` or `/var/log/`
- **401 on every request** → JWT secret wrong or middleware applied to all routes
- **CORS error from browser** → `Access-Control-Allow-Origin` header missing
- **Empty JSON `{}`** → handler not returning response; check async/await usage

### Evidence to collect

- `curl` output for each tested endpoint (first 200 chars)
- HTTP status codes
- Any error messages from logs
