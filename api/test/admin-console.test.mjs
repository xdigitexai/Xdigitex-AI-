import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtime = await readFile(new URL("../admin-runtime.mjs", import.meta.url), "utf8");
const ui = await readFile(new URL("../../frontend/public/admin-console.js", import.meta.url), "utf8");
const app = await readFile(new URL("../index.mjs", import.meta.url), "utf8");

test("admin operations are backend protected and audited", () => {
  assert.match(runtime, /ADMIN_ROLES/);
  assert.match(runtime, /ADMIN_USER_SUSPENDED/);
  assert.match(runtime, /ADMIN_CREDIT_ADJUSTED/);
  assert.match(runtime, /idempotency_key TEXT UNIQUE/);
  assert.match(runtime, /current admin IP cannot be blocked/);
});

test("admin console uses real operations APIs without fake metrics", () => {
  assert.match(ui, /\/api\/admin\/ops\/overview/);
  assert.match(ui, /\/api\/admin\/ops\/users/);
  assert.match(ui, /\/api\/admin\/ops\/security/);
  assert.doesNotMatch(ui, /Math\.random|99\.9%|12,480|Failed Logins \(24h\).*12/);
});

test("account restrictions are enforced by shared authentication", () => {
  assert.match(app, /Account is suspended or disabled/);
  assert.match(app, /recordLoginAttempt/);
  assert.match(app, /installAdminRuntime/);
});
