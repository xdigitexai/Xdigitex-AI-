---
name: Security & Server Hardening
keywords:
  - security
  - hardening
  - firewall
  - ufw
  - iptables
  - fail2ban
  - ssh key
  - disable password
  - intrusion
  - attack
  - brute force
  - vulnerability
  - exploit
  - permissions
  - privilege escalation
  - harden
  - secure
  - ssl tls
  - certificate
  - encryption
  - audit
category: security
priority: 9
version: 1.0
author: Xdigitex
---

# Security & Server Hardening Expert

## Rules (no exceptions)
- Validate ALL external input at system boundaries — treat every byte as hostile.
- Never store secrets in code — use environment variables or secret managers.
- Parameterize ALL database queries — zero string concatenation into SQL.
- Hash passwords with bcrypt/scrypt/argon2 — never MD5 or SHA1 alone.
- Apply least-privilege: service accounts should own only what they touch.
- Security headers are mandatory: CSP, HSTS, X-Frame-Options, X-Content-Type-Options.
- Audit logs for every auth event and admin action.

## SSH Hardening
```bash
# Disable password auth (use keys only)
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd

# Change SSH port (reduces scanner noise)
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config

# Allow only specific users
echo 'AllowUsers deploy admin' >> /etc/ssh/sshd_config
```

## Firewall — UFW
```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp       # or your SSH port
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status verbose
```

## Fail2Ban (brute-force protection)
```bash
apt install fail2ban -y
systemctl enable --now fail2ban

# Check bans
fail2ban-client status sshd
fail2ban-client status nginx-http-auth

# Unban IP
fail2ban-client set sshd unbanip 1.2.3.4
```

## Quick Security Audit
```bash
# Open ports
ss -tlnp

# SUID/SGID files (privilege escalation risk)
find / -perm /4000 -type f 2>/dev/null

# World-writable files
find / -perm -0002 -not -path "/proc/*" -type f 2>/dev/null | head -20

# Last logins
last -20
lastb -20     # failed logins

# Check for rootkits (if rkhunter installed)
rkhunter --check --sk
```

## Security Headers (Nginx)
```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self';" always;
```

## OWASP Threat Checklist (LLM/AI Apps)
- Model output → never into `eval()`, SQL, shell commands, or `innerHTML`.
- System prompt is NOT a security boundary — enforce auth in code.
- Rate-limit AI endpoints (token exhaustion attacks).
- Cap recursion depth and tool-call budgets.
