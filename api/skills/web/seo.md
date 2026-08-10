---
name: SEO & Web Performance
keywords:
  - seo
  - search engine
  - google
  - meta tags
  - sitemap
  - robots.txt
  - open graph
  - og tags
  - page speed
  - core web vitals
  - lcp
  - cls
  - inp
  - schema markup
  - structured data
  - canonical
  - redirect
  - 301 redirect
category: web
priority: 7
version: 1.0
author: Xdigitex
---

# SEO & Web Performance Expert

## Rules
- Title tag: 50–60 chars; unique per page; most important keyword first.
- Meta description: 150–160 chars; compelling; include primary keyword.
- Every page needs ONE `<h1>` — it should contain the primary keyword.
- Canonical tags prevent duplicate content penalties — always add them.
- HTTPS is a ranking signal — non-HTTPS sites rank lower.
- Core Web Vitals failures = ranking demotion — measure before optimizing.

## Essential Meta Tags
```html
<head>
  <title>Primary Keyword – Brand Name</title>
  <meta name="description" content="150-160 char description with keyword.">
  <link rel="canonical" href="https://example.com/page/">

  <!-- Open Graph (social sharing) -->
  <meta property="og:title" content="Page Title">
  <meta property="og:description" content="Description for social.">
  <meta property="og:image" content="https://example.com/image.jpg">
  <meta property="og:url" content="https://example.com/page/">
  <meta property="og:type" content="website">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Page Title">
  <meta name="twitter:image" content="https://example.com/image.jpg">
</head>
```

## Sitemap (sitemap.xml)
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-01</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>
```

## robots.txt
```
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Sitemap: https://example.com/sitemap.xml
```

## Core Web Vitals Targets
| Metric | Good |
|--------|------|
| LCP (Largest Contentful Paint) | ≤ 2.5s |
| INP (Interaction to Next Paint) | ≤ 200ms |
| CLS (Cumulative Layout Shift) | ≤ 0.1 |

## Speed Improvements (Nginx)
```nginx
# Gzip compression
gzip on;
gzip_types text/plain text/css application/javascript application/json image/svg+xml;
gzip_min_length 1024;

# Browser caching
location ~* \.(js|css|png|jpg|ico|woff2)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
}
```

## Redirect Chains (avoid!)
```nginx
# Good: single 301
return 301 https://example.com$request_uri;

# Bad: /old → /middle → /new (kills link equity)
```
