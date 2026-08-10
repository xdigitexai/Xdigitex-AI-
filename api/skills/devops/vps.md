---
name: VPS Management & Optimization
keywords:
  - vps
  - server setup
  - server management
  - ram
  - memory
  - swap
  - cpu usage
  - disk usage
  - monitoring
  - pm2
  - process manager
  - node server
  - startup
  - reboot
  - uptime
  - server performance
  - out of memory
  - oom
  - load average
category: devops
priority: 9
version: 1.0
author: Xdigitex
---

# VPS Management & Optimization Expert

## Rules
- Check resources first: `free -h && df -h && uptime` — always.
- PM2 is the process manager for Node.js apps — use `pm2` commands, not raw `node`.
- Add swap before RAM runs out — 2× RAM up to 8GB.
- Never kill processes blindly — identify them first with `ps aux` and `lsof`.
- After a config change always verify the service started: `pm2 status` or `systemctl status`.

## Resource Health Check
```bash
free -h                            # RAM + swap
df -h                              # disk
uptime                             # load average (1/5/15 min)
ps aux --sort=-%mem | head -15    # top RAM users
ps aux --sort=-%cpu | head -15    # top CPU users
```

## PM2 — Node.js Process Manager
```bash
pm2 list                          # all processes
pm2 status                        # same with more detail
pm2 restart <name>                # restart app
pm2 stop <name>
pm2 delete <name>
pm2 logs <name> --lines 100       # last 100 lines
pm2 logs <name> --err             # stderr only
pm2 monit                         # live dashboard
pm2 startup                       # enable PM2 on boot
pm2 save                          # save current process list
pm2 reload <name>                 # zero-downtime reload
```

## Add Swap
```bash
# Check existing swap
swapon --show

# Create 4GB swap
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Tune swappiness (lower = prefer RAM)
echo 'vm.swappiness=10' >> /etc/sysctl.conf
sysctl -p
```

## Free RAM Fast
```bash
# Drop page cache (safe, no data loss)
sync && echo 3 > /proc/sys/vm/drop_caches

# Restart the heaviest service
pm2 restart <name>

# Remove stopped containers
docker container prune -f
```

## Autostart on Reboot
```bash
# PM2
pm2 startup    # outputs a command to run; run that command
pm2 save

# systemd service
systemctl enable <service>
```

## Cron Jobs
```bash
crontab -e          # edit current user's cron
crontab -l          # list
# Format: MIN HOUR DOM MON DOW command
# 0 */6 * * *  /opt/scripts/backup.sh
```
