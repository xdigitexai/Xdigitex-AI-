---
name: MySQL & MariaDB
keywords:
  - mysql
  - mariadb
  - database
  - sql
  - query
  - table
  - migration
  - index
  - backup
  - restore
  - dump
  - mysqldump
  - slow query
  - connection refused mysql
  - database error
category: database
priority: 8
version: 1.0
author: Xdigitex
---

# MySQL & MariaDB Expert

## Rules
- ALWAYS use parameterized queries — never concatenate user input into SQL.
- Index foreign keys and any column used in WHERE clauses.
- Back up before any destructive operation: `mysqldump`.
- Use `EXPLAIN` to analyze slow queries before adding indexes.
- Never run migrations without testing on a staging DB first.

## Essential Commands
```sql
-- Show databases / tables
SHOW DATABASES;
USE mydb;
SHOW TABLES;
DESCRIBE users;

-- User management
CREATE USER 'app'@'localhost' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON mydb.* TO 'app'@'localhost';
FLUSH PRIVILEGES;
SHOW GRANTS FOR 'app'@'localhost';

-- Table operations
CREATE TABLE orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','paid','cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id)
);

ALTER TABLE orders ADD COLUMN paid_at TIMESTAMP NULL;
ALTER TABLE orders ADD INDEX idx_status (status);
```

## Backup & Restore
```bash
# Backup single DB
mysqldump -u root -p mydb > mydb_backup.sql

# Backup all DBs
mysqldump -u root -p --all-databases > all_backup.sql

# Restore
mysql -u root -p mydb < mydb_backup.sql
```

## Diagnose Issues
```sql
-- Active connections
SHOW PROCESSLIST;

-- Kill long-running query
KILL <id>;

-- Check table sizes
SELECT table_name, ROUND(data_length/1024/1024,2) AS 'Data MB'
FROM information_schema.tables WHERE table_schema = 'mydb'
ORDER BY data_length DESC;

-- Analyze slow query
EXPLAIN SELECT * FROM orders WHERE user_id = 5;
```

## Shell Access
```bash
mysql -u root -p
mysql -u root -p -e "SHOW DATABASES;"
systemctl status mysql
systemctl restart mysql
tail -100 /var/log/mysql/error.log
```

## Performance
```sql
-- Add composite index
ALTER TABLE orders ADD INDEX idx_user_status (user_id, status);

-- Optimize table
OPTIMIZE TABLE orders;

-- Check index usage
SHOW INDEX FROM orders;
```
