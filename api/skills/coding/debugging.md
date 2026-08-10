---
name: Debugging & Error Recovery
keywords:
  - debug
  - debugging
  - error
  - exception
  - crash
  - broken
  - fix
  - not working
  - failed
  - failure
  - stack trace
  - traceback
  - logs
  - bug
  - issue
  - problem
  - troubleshoot
  - investigate
  - diagnose
  - undefined
  - null
  - 500 error
category: coding
priority: 10
version: 1.0
author: Xdigitex
---

# Debugging & Error Recovery Expert

## The Stop-the-Line Rule
When anything breaks:
1. **STOP** adding features — preserve the error exactly as-is.
2. **PRESERVE** evidence: full error message, stack trace, logs.
3. **DIAGNOSE** — follow the triage checklist below.
4. **FIX** the root cause, not the symptom.
5. **GUARD** against recurrence with a test or assertion.
6. **RESUME** only after verification passes.

Never push past a failing test or broken build. Errors compound.

## Triage Checklist (in order — do not skip)
1. **Reproduce** — make it fail reliably. If you can't reproduce, gather more context.
2. **Isolate** — what changed between working and broken? (last deploy, config, dependency).
3. **Read the error** — read the FULL stack trace top-to-bottom; the root cause is usually at the bottom.
4. **Check logs** — app logs, system logs, DB logs.
5. **Simplify** — reduce to the minimal case that reproduces the failure.
6. **Fix root cause** — do not paper over with try/catch unless you understand why.
7. **Verify** — confirm the fix works AND didn't break anything adjacent.

## Read Logs First
```bash
# App (PM2)
pm2 logs <name> --lines 100

# systemd service
journalctl -u <service> -n 100 --no-pager

# Nginx
tail -100 /var/log/nginx/error.log

# App log files
tail -100 /var/log/app/*.log
find /var/log -name "*.log" -newer /tmp/mark -exec tail -20 {} \;
```

## Common Error Patterns
| Error | Likely Cause | Action |
|-------|-------------|--------|
| ECONNREFUSED | Upstream not listening | Check `ss -tlnp \| grep <port>` |
| EACCES | Permission denied | `ls -la` the path; `chmod`/`chown` |
| ENOENT | File not found | Check path; `ls` the directory |
| OOM / killed | Out of memory | `dmesg \| grep -i oom`; add swap |
| 502 Bad Gateway | App crashed/not running | `pm2 status`; restart |
| ETIMEDOUT | Network or firewall | `curl -v`; `ufw status` |
| SyntaxError | Bad JS/JSON/config | Check the line number in the trace |

## Node.js Debug
```bash
# Heap dump on OOM
node --max-old-space-size=512 app.js

# Verbose module resolution
NODE_DEBUG=module node app.js

# Check package version conflicts
npm ls <package>
```

## Database Debug
```bash
# Check connection
mysql -h host -u user -p -e "SELECT 1;"
psql -h host -U user -d db -c "SELECT 1;"

# Slow query log (MySQL)
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1;

# Active connections
SHOW PROCESSLIST;          # MySQL
SELECT * FROM pg_stat_activity;  # Postgres
```
