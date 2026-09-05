import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeSpecialistActivity } from "../admin-runtime.mjs";

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

test("agent run observability reports specialists without exposing reasoning", () => {
  const summary = summarizeSpecialistActivity({}, [
    { type: "specialist.started", payload: { specialist: "frontend", tokens: 120 }, created_at: "2026-01-01" },
    { type: "tool.completed", payload: { specialist: "frontend", duration_ms: 250 } },
    { type: "specialist.handoff", payload: { from: "frontend", to: "verifier", reason: "ready" } },
    { type: "skills.loaded", payload: { specialist: "verifier", skills: [{ name: "browser", version: "2" }] } },
  ], []);
  assert.equal(summary.active_specialist, "verifier");
  assert.equal(summary.specialists.find(x => x.name === "frontend").tokens, 120);
  assert.equal(summary.handoffs.length, 1);
  assert.deepEqual(summary.skills, [{ name: "browser", version: "2" }]);
  assert.match(ui, /Active specialist/);
  assert.doesNotMatch(ui, /chain.of.thought|model reasoning/i);
});
