---
name: Dashboard & Admin Panel
keywords:
  - dashboard
  - admin
  - admin panel
  - panel
  - overview
  - analytics
  - stats
  - widgets
  - data table
  - admin area
  - control panel
  - management
  - backend panel
category: verification
priority: 8
needs_auth: true
can_self_register: false
steps:
  - dashboard_loads|Dashboard loads (HTTP 200, not redirect to login)
  - widgets_visible|Key widgets/cards render with data (not empty/loading)
  - no_js_errors|No JS errors in console
  - navigation_works|Sidebar/nav links work (no 404 on click)
  - data_loads|At least one data table or chart renders real data [optional]
  - mobile_responsive|Page is usable on mobile viewport [optional]
---

## Dashboard Verification Mission

You are verifying that the dashboard/admin panel renders correctly for authenticated users.

### Steps in order

1. **Login first** — use test account credentials
2. **Navigate to dashboard** (`/dashboard`, `/admin`, `/panel`, or `/`)
3. **Check URL** — should NOT redirect to login (would mean auth failed)
4. **Screenshot entire page** — at full desktop viewport
5. **Check widgets** — confirm numbers/charts are loading, not stuck on spinner
6. **Click navigation items** — sidebar links should load new pages without 404
7. **Check browser console** — no red errors, no failed network requests (404/500)
8. **Mobile check** — resize to 375px wide, confirm layout doesn't break [optional]

### Common failure patterns

- **Redirects to login** → authentication middleware not passing; check token/cookie config
- **Widgets show 0 / empty** → API returning empty; check DB data exists and API endpoint responds
- **404 on nav links** → route not registered or incorrect base path
- **Console errors** → usually missing env vars or failed API calls; check network tab

### Evidence to collect

- Screenshot of dashboard at desktop size
- Screenshot of at least one working data section
- HTTP status of main API calls visible in network tab
