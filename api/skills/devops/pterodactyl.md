---
name: Pterodactyl Game Server Panel
keywords:
  - pterodactyl
  - game server
  - panel
  - wings
  - game hosting
  - minecraft
  - game panel
  - node
  - allocation
  - egg
  - nest
  - server allocation
  - pterodactyl wings
category: devops
priority: 8
version: 1.0
author: Xdigitex
---

# Pterodactyl Game Server Expert

## Rules
- Pterodactyl Panel runs at `panel.domain.com`; Wings (daemon) runs on each node.
- Wings service name: `wings` — managed by systemd.
- Panel config at `/var/www/pterodactyl/.env`.
- Wings config at `/etc/pterodactyl/config.yml`.
- Never modify the database directly — always use the Panel web UI or artisan commands.
- Logs are critical: Wings logs at `/var/log/pterodactyl/wings.log`.

## Wings Management
```bash
systemctl status wings
systemctl restart wings
journalctl -u wings -n 100 --no-pager
tail -100 /var/log/pterodactyl/wings.log
```

## Panel Maintenance (Laravel artisan)
```bash
cd /var/www/pterodactyl
php artisan migrate --force              # run DB migrations
php artisan queue:restart                # restart queue workers
php artisan up                           # take out of maintenance mode
php artisan down                         # maintenance mode
php artisan p:schedule:process           # manual cron trigger
```

## Panel Queue Worker
```bash
systemctl status pteroq
systemctl restart pteroq
```

## Container RAM Pressure Fix
```bash
# List all game server containers and their RAM
docker ps --format "{{.Names}}\t{{.Status}}" | grep pterodactyl

# Stop suspended/idle containers to free RAM
docker ps -a --filter "label=Service=Pterodactyl" --format "{{.Names}} {{.Status}}"
```

## Common Issues
- Wings offline: restart `wings` service; check config.yml `remote` URL matches panel.
- Panel 500 error: check `storage/logs/laravel-*.log`.
- Queue not processing: restart `pteroq`.
- Server stuck at starting: Wings logs → check node disk/RAM.
- Allocation conflict: remove allocation in panel → re-add.
