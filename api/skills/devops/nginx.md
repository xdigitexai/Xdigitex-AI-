---
name: Nginx & Reverse Proxy
keywords:
  - nginx
  - reverse proxy
  - proxy
  - vhost
  - virtual host
  - ssl
  - https
  - certbot
  - letsencrypt
  - subdomain
  - domain
  - 502
  - 503
  - upstream
  - load balance
  - web server
  - proxy_pass
  - server block
  - sites-enabled
  - sites-available
category: devops
priority: 9
version: 1.0
author: Xdigitex
---

# Nginx & Reverse Proxy Expert

## Rules
- Always test config before reloading: `nginx -t` — never skip.
- Use `nginx -s reload` not `restart` to avoid downtime.
- Never put certs directly in `/etc/nginx` — keep them at `/etc/letsencrypt/`.
- Proxy headers must include `X-Real-IP`, `X-Forwarded-For`, `Host`.
- Always set `proxy_read_timeout` and `proxy_connect_timeout` for slow upstreams.
- Return `444` (no response) for unmatched server names to block scanners.

## Standard Reverse Proxy Block
```nginx
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_connect_timeout 10s;
    }
}
```

## SSL with Certbot
```bash
certbot --nginx -d example.com -d www.example.com
certbot renew --dry-run
systemctl status certbot.timer   # auto-renewal
```

## Diagnose Issues
```bash
nginx -t                          # config test
nginx -s reload                   # reload
tail -50 /var/log/nginx/error.log
tail -50 /var/log/nginx/access.log
# 502 Bad Gateway → upstream app not running; check port
# 504 Gateway Timeout → app too slow; increase proxy_read_timeout
ss -tlnp | grep <port>            # confirm upstream is listening
```

## File Locations
```
/etc/nginx/nginx.conf             main config
/etc/nginx/sites-available/       vhosts (disabled)
/etc/nginx/sites-enabled/         symlinked active vhosts
/var/log/nginx/error.log
/var/log/nginx/access.log
```

## Enable a Site
```bash
ln -s /etc/nginx/sites-available/mysite /etc/nginx/sites-enabled/
nginx -t && nginx -s reload
```
