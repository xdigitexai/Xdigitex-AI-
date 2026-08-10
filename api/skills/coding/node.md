---
name: Node.js & JavaScript Backend
keywords:
  - nodejs
  - node.js
  - node
  - javascript
  - express
  - fastify
  - npm
  - pnpm
  - yarn
  - package.json
  - typescript
  - ts
  - api
  - rest api
  - endpoint
  - middleware
  - env
  - dotenv
  - module
  - import
  - require
  - async
  - await
  - promise
category: coding
priority: 8
version: 1.0
author: Xdigitex
---

# Node.js & JavaScript Backend Expert

## Rules
- Always use `async/await` — never mix callbacks and promises.
- Validate all request body/params at the entry point (use Zod or Joi).
- Never log secrets or full request bodies to console in production.
- Use `process.env.NODE_ENV` to gate dev-only behaviour.
- Handle uncaught exceptions: `process.on('uncaughtException', ...)` and `unhandledRejection`.
- Always set explicit response types and status codes — never rely on defaults.

## Express Patterns
```typescript
import express from "express";
const app = express();

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// Typed route with validation
app.post("/api/resource", async (req, res) => {
  try {
    const data = schema.parse(req.body);    // Zod validation
    const result = await service.create(data);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof ZodError) return res.status(400).json({ error: err.flatten() });
    console.error(err);
    res.status(500).json({ error: "Internal error" });
  }
});

// Error handler (last middleware)
app.use((err: Error, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});
```

## Environment Variables
```bash
# .env (never commit)
DATABASE_URL=postgres://...
API_KEY=sk-...

# Load in code
import "dotenv/config";
const key = process.env.API_KEY ?? (() => { throw new Error("API_KEY not set"); })();
```

## Async Error Handling
```typescript
// Wrap async route to avoid unhandled rejections
const asyncHandler = (fn: Function) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

app.get("/", asyncHandler(async (req, res) => {
  const data = await fetchSomething();
  res.json(data);
}));
```

## PM2 Production Config
```json
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: "my-api",
    script: "./dist/index.mjs",
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: "400M",
    env: { NODE_ENV: "production" }
  }]
};
```

## Package Management (pnpm)
```bash
pnpm install              # install deps
pnpm add <pkg>            # add dependency
pnpm add -D <pkg>         # dev dependency
pnpm remove <pkg>
pnpm run build
pnpm run dev
pnpm dlx <cli-tool>       # run without installing globally
```
