---
name: Website & Frontend
keywords:
  - website
  - web page
  - landing page
  - homepage
  - frontend
  - html
  - css
  - design
  - ui
  - interface
  - styling
  - layout
  - page loads
  - site down
  - site not loading
  - blank page
  - white page
  - page not found
  - 404
category: verification
priority: 9
needs_auth: false
can_self_register: false
steps:
  - homepage_http200|Homepage returns HTTP 200
  - html_content_present|HTML content rendered (not blank/empty body)
  - css_loaded|CSS loads and styles are applied (not plain HTML)
  - images_load|Images and media load without 404 [optional]
  - navigation_works|Navigation links are clickable and working
  - mobile_responsive|Mobile layout is usable at 375px width [optional]
  - no_console_errors|No JS errors in browser console
  - no_broken_links|No 404 links on main navigation [optional]
---

## Website Verification Mission

You are verifying that the website renders correctly and is accessible.

### Steps in order

1. **HTTP check** — `curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:<PORT>/`
2. **Content check** — `curl -s http://localhost:<PORT>/ | grep -c '<section\|<main\|hero\|container'`
3. **Browser screenshot** — navigate to homepage, screenshot the full page
4. **Check styling** — confirm CSS is applied (not plain black-on-white text)
5. **Check images** — images should load (no broken image icons)
6. **Click nav links** — confirm main navigation works
7. **Mobile viewport** — resize to 375px, screenshot, confirm usable layout
8. **Console check** — no red JS errors, no 404 network requests for assets

### Success criteria

- HTTP 200 confirmed via curl (ground truth)
- Screenshot shows styled, non-blank page
- Navigation is functional

### Common failure patterns

- **Blank page** → JS error on load; check console first
- **Unstyled HTML** → CSS file 404; check asset paths/CDN config
- **HTTP 502/503** → upstream app not running; `pm2 status` or `systemctl status`
- **HTTP 404** → Nginx/Apache not pointing to correct document root
- **Images 404** → incorrect static file path; check storage:link (Laravel) or static middleware

### Evidence to collect

- `curl` HTTP status + content count
- Full-page screenshot (desktop + mobile)
- Any 404s visible in network tab
