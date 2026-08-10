---
name: SSH & Linux Server
keywords:
  - ssh
  - linux
  - server
  - bash
  - shell
  - terminal
  - command
  - root
  - sudo
  - systemd
  - service
  - daemon
  - cron
  - process
  - kill
  - ps aux
  - htop
  - journalctl
  - syslog
  - /etc
  - /var
  - /opt
  - chmod
  - chown
  - rsync
  - scp
  - grep
  - tail
  - awk
  - sed
category: devops
priority: 9
version: 1.0
author: Xdigitex
---

# SSH & Linux Server Expert

## Rules
- Run `whoami` and `pwd` first when context is unclear — never assume directory.
- Always prefer `systemctl status <svc>` over raw process checks.
- Check `journalctl -u <svc> -n 50 --no-pager` for service errors before editing configs.
- Use `ss -tlnp` (not `netstat`) to check open ports.
- Before editing any config: back it up with `cp file file.bak.$(date +%s)`.
- Chain commands with `&&` — stop on first failure.
- Never `rm -rf /` or delete system directories.
- When a service won't start: read the last 20 lines of its log first.

## Diagnose Server Issues
```bash
# Health snapshot
free -h && df -h && uptime && ss -tlnp

# Who is eating RAM
ps aux --sort=-%mem | head -20

# Who is eating CPU
ps aux --sort=-%cpu | head -20

# Disk usage by folder
du -sh /var/log/* | sort -rh | head -10

# Recent system errors
journalctl -p err -n 30 --no-pager
```

## Service Management
```bash
systemctl start|stop|restart|reload <service>
systemctl enable|disable <service>
systemctl status <service>
journalctl -u <service> -f        # follow live logs
journalctl -u <service> -n 100 --no-pager
```

## File & Permissions
```bash
chmod 755 /path/dir      # rwxr-xr-x
chmod 644 /path/file     # rw-r--r--
chown user:group /path   # ownership
find /path -type f -newer /tmp/marker   # changed recently
```

## Process Management
```bash
kill -9 <pid>              # force kill
pkill -f "process-name"    # by name
nohup command &            # detach
screen -S session-name     # persistent session
tmux new -s session-name
```

## Network Diagnostics
```bash
curl -I https://domain.com           # HTTP headers
curl -o /dev/null -sw "%{http_code}" https://domain.com
ping -c 3 domain.com
traceroute domain.com
dig domain.com
ss -tlnp | grep :80
```

## Common Fixes
- Port in use: `fuser -k 80/tcp` then restart service.
- OOM kills: check `dmesg | grep -i oom`, then add swap or reduce service memory.
- Disk full: `du -sh /var/log && journalctl --vacuum-size=200M`.
- Permission denied: check `ls -la` parent dirs; common fix `chmod o+x /path`.
