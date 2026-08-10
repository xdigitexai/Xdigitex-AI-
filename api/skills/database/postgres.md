---
name: PostgreSQL
keywords:
  - postgres
  - postgresql
  - psql
  - pg
  - database
  - drizzle
  - prisma
  - sql
  - query
  - table
  - schema
  - pg dump
  - pg restore
  - connection pool
category: database
priority: 8
version: 1.0
author: Xdigitex
---

# PostgreSQL Expert

## Rules
- Use parameterized queries ($1, $2) — never concatenate user data into SQL.
- Every foreign key should have an index.
- Use `EXPLAIN ANALYZE` on slow queries before adding indexes.
- Use `pg_dump` for backups, not manual SQL exports.
- Never `DROP TABLE` without a backup and explicit confirmation.
- Use transactions for multi-step operations.

## Essential psql Commands
```bash
psql -U postgres -d mydb
\l             # list databases
\c mydb        # connect to DB
\dt            # list tables
\d tablename   # describe table
\du            # list users
\q             # quit
```

## Common SQL
```sql
-- Create DB + user
CREATE DATABASE mydb;
CREATE USER myapp WITH PASSWORD 'secret';
GRANT ALL PRIVILEGES ON DATABASE mydb TO myapp;

-- Create table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add column
ALTER TABLE users ADD COLUMN name VARCHAR(100);

-- Index
CREATE INDEX idx_users_email ON users (email);

-- Upsert
INSERT INTO users (email, name) VALUES ($1, $2)
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name;
```

## Backup & Restore
```bash
pg_dump -U postgres mydb > mydb.sql
pg_restore -U postgres -d mydb mydb.dump  # binary format
psql -U postgres mydb < mydb.sql          # plain SQL
```

## Diagnose
```sql
-- Active queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active' ORDER BY duration DESC;

-- Kill query
SELECT pg_terminate_backend(<pid>);

-- Table sizes
SELECT relname, pg_size_pretty(pg_total_relation_size(oid))
FROM pg_class WHERE relkind = 'r' ORDER BY pg_total_relation_size(oid) DESC LIMIT 20;
```

## Shell
```bash
systemctl status postgresql
sudo -u postgres psql
tail -100 /var/log/postgresql/postgresql-*.log
```
