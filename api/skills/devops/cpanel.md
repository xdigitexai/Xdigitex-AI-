---
name: cPanel & Web Hosting
keywords:
  - cpanel
  - whm
  - web hosting
  - hosting
  - email
  - ftp
  - php version
  - php
  - addon domain
  - subdomain
  - nameserver
  - zone file
  - softaculous
  - file manager
  - mysql database
  - email forwarder
  - spam filter
  - ssl cpanel
category: devops
priority: 7
version: 1.0
author: Xdigitex
---

# cPanel & Web Hosting Expert

## Rules
- Access: `https://domain.com:2083` (user) or `https://server:2087` (WHM root).
- Always use `whmapi1` or `cpapi2` from shell — never hand-edit `/etc/passwd` or zone files.
- PHP settings per-site via `MultiPHP INI Editor` or `.htaccess`, not global `php.ini`.
- Before deleting accounts: full backup first (`pkgacct` command).
- Email deliverability issues → check SPF, DKIM, DMARC in DNS Zone Editor.

## Common cPanel API (shell as root)
```bash
# List all accounts
whmapi1 listaccts

# Create account
whmapi1 createacct username=user domain=example.com password=pass

# Suspend / unsuspend
whmapi1 suspendacct user=username reason="Non-payment"
whmapi1 unsuspendacct user=username

# Backup account
/scripts/pkgacct username /backup/

# Check disk usage
repquota -a | head -30
```

## MySQL/MariaDB via cPanel
```bash
mysql -u root -p               # root access
SHOW DATABASES;
# Create DB + user via cPanel or:
mysql -e "CREATE DATABASE user_db; GRANT ALL ON user_db.* TO 'user'@'localhost' IDENTIFIED BY 'pass';"
```

## Email Troubleshooting
```bash
tail -100 /var/log/exim_mainlog     # mail log
tail -100 /var/log/exim_rejectlog   # rejections
exim -bp | head -20                 # mail queue
exim -qff                           # force queue flush
```

## SSL via cPanel
- AutoSSL: WHM → SSL/TLS → Manage AutoSSL → Run AutoSSL for all users.
- Manual: cPanel → SSL/TLS → Install SSL → paste cert + key.

## PHP Config
```bash
# Set PHP version for account
whmapi1 php_set_vhost_versions vhost=example.com version=ea-php82

# .htaccess PHP settings
# AddType application/x-httpd-ea-php82 .php
# php_value upload_max_filesize 64M
```
