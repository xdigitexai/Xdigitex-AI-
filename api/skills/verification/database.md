---
name: Database & Data Integrity
keywords:
  - database
  - db
  - mysql
  - postgresql
  - postgres
  - migration
  - schema
  - table
  - seeder
  - seed
  - query
  - connection
  - db error
  - database error
  - sql
  - data
  - records
category: verification
priority: 8
needs_auth: false
can_self_register: false
steps:
  - db_connects|Database connection succeeds (no connection refused/auth error)
  - tables_exist|Required tables exist in the database
  - migrations_run|All migrations are applied (no pending migrations)
  - data_readable|Can read records from main tables
  - write_works|Can insert and delete a test record [optional]
  - no_slow_queries|No queries taking > 2s [optional]
---

## Database Verification Mission

You are verifying that the database is properly set up and accessible.

### Steps in order

1. **Test connection**:
   ```bash
   # MySQL
   mysql -h localhost -u <user> -p<pass> -e "SELECT 1;" 2>&1 | head -5
   # PostgreSQL
   psql postgresql://<user>:<pass>@localhost/<db> -c "SELECT 1;" 2>&1 | head -5
   ```
2. **List tables** — confirm required tables exist
3. **Check migrations** — `php artisan migrate:status` (Laravel) or check schema version
4. **Test read** — `SELECT COUNT(*) FROM users;` (or main table)
5. **Test write** (non-destructive):
   ```sql
   INSERT INTO test_verify (created_at) VALUES (NOW());
   -- then immediately:
   DELETE FROM test_verify ORDER BY id DESC LIMIT 1;
   ```
6. **Check for errors** — look at DB error log for recent issues

### Common failure patterns

- **Connection refused** → DB service not running; `systemctl status mysql` or `systemctl status postgresql`
- **Access denied** → wrong password or user lacks permissions; `SHOW GRANTS FOR 'user'@'localhost'`
- **Table doesn't exist** → migrations not run; `php artisan migrate --force`
- **Out of disk** → DB writes fail silently; `df -h` to check disk space

### Evidence to collect

- Connection test output
- `SHOW TABLES` output
- Row count from main tables
- Any error log lines
