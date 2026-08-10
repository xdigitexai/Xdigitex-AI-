---
name: PHP & Laravel
keywords:
  - php
  - laravel
  - artisan
  - eloquent
  - blade
  - composer
  - migration
  - model
  - controller
  - route
  - middleware
  - queue
  - job
  - cache
  - laravel nova
  - livewire
  - inertia
category: coding
priority: 8
version: 1.0
author: Xdigitex
---

# PHP & Laravel Expert

## Rules
- Prefer Laravel conventions — don't reinvent what the framework provides.
- Never rewrite unrelated files when fixing a specific bug.
- Use migrations for ALL schema changes — never ALTER TABLE manually.
- Preserve existing routes — add alongside, don't replace.
- Use `php artisan tinker` to test Eloquent queries before writing code.
- Gate business logic in service classes — keep controllers thin.
- Always run `php artisan config:clear` after `.env` changes.

## Common Artisan Commands
```bash
php artisan migrate --force
php artisan migrate:rollback
php artisan make:model Post -mcr      # model + migration + controller + resource
php artisan make:middleware AuthCheck
php artisan make:job ProcessPayment
php artisan queue:work --sleep=3 --tries=3
php artisan cache:clear
php artisan config:clear
php artisan route:clear && php artisan route:cache
php artisan storage:link             # public storage symlink
php artisan tinker                   # REPL
```

## Eloquent Patterns
```php
// Relationships
class User extends Model {
    public function posts() { return $this->hasMany(Post::class); }
    public function profile() { return $this->hasOne(Profile::class); }
}

// Query
User::where('active', true)->orderBy('created_at', 'desc')->paginate(20);
User::with('posts')->find($id);       // eager load
User::firstOrCreate(['email' => $email], ['name' => $name]);
```

## Debugging
```bash
# Logs
tail -100 storage/logs/laravel.log

# Check queue jobs
php artisan queue:failed
php artisan queue:retry all

# Check routes
php artisan route:list | grep "api"

# Check .env
php artisan env
```

## Performance
```bash
php artisan optimize          # route + config cache
php artisan view:cache
# Use Redis for cache + queues
# CACHE_DRIVER=redis, QUEUE_CONNECTION=redis in .env
```

## cPanel / Shared Hosting
```bash
# Run artisan via cPanel terminal
cd public_html/myapp && php8.1 artisan migrate --force
# Set document root to: /home/user/public_html/myapp/public
```
