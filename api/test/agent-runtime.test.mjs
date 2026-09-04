import test from "node:test";
import assert from "node:assert/strict";
import {
  RUN_TRANSITIONS, ToolRegistry, classifyCommand, completionGuard,
  createDefaultToolRegistry, redactSecrets, chooseModel,
  migrations,
} from "../agent-runtime.mjs";

test("run state machine allows resume while rejecting invalid transitions", () => {
  assert.equal(RUN_TRANSITIONS.queued.has("running"), true);
  assert.equal(RUN_TRANSITIONS.failed.has("queued"), true);
  assert.equal(RUN_TRANSITIONS.completed.has("running"), false);
});

test("SSH and firewall safety controls always require approval", () => {
  for (const command of ["sed -i s/22/2200/ /etc/ssh/sshd_config", "ufw allow 443", "iptables -F"]) {
    const result = classifyCommand(command);
    assert.equal(result.risk, "high"); assert.equal(result.alwaysRequireApproval, true);
  }
  assert.equal(classifyCommand("git status").risk, "low");
});

test("secret redaction covers headers, nested keys, and inline values", () => {
  const clean = redactSecrets({ authorization: "Bearer abc", nested: { apiKey: "123", line: "password=hunter2" } });
  assert.equal(clean.authorization, "[REDACTED]");
  assert.equal(clean.nested.apiKey, "[REDACTED]");
  assert.match(clean.nested.line, /\[REDACTED\]/);
  assert.doesNotMatch(JSON.stringify(clean), /hunter2|abc|123/);
});

test("tool results are structured and timeout is distinct from failure", async () => {
  const registry = new ToolRegistry().register({ name: "hang", timeoutMs: 10, execute: async (_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))) });
  const result = await registry.execute("hang", {});
  assert.equal(result.success, false); assert.equal(result.status, "timeout"); assert.equal(typeof result.durationMs, "number");
});

test("workspace tools reject traversal", async () => {
  const tools = createDefaultToolRegistry({ workspaceRoot: process.cwd() });
  const result = await tools.execute("read_file", { path: "../outside" });
  assert.equal(result.success, false); assert.match(result.stderr, /escapes workspace/);
});

test("completion guard requires both work and verification", () => {
  assert.equal(completionGuard({ changed: true, requiredItems: [{ status: "completed" }], verification: [{ status: "passed" }] }).complete, true);
  assert.equal(completionGuard({ changed: false, requiredItems: [], verification: [] }).complete, false);
  assert.equal(completionGuard({ changed: true, requiredItems: [{ status: "pending" }], verification: [] }).complete, false);
});

test("model routing prefers inexpensive summarization and coding-capable models", () => {
  const models = ["gpt-5-codex", "gpt-4o-mini"];
  assert.equal(chooseModel("summarization", models), "gpt-4o-mini");
  assert.equal(chooseModel("coding", models), "gpt-5-codex");
});

test("non-negotiable cron-worker workflow continues after a failed diagnostic", async () => {
  const calls = [];
  const registry = new ToolRegistry()
    .register({ name: "inspect_cron", execute: async () => { calls.push("inspect"); return { stdout: "stale lock detected" }; } })
    .register({ name: "patch_worker", execute: async () => { calls.push("patch"); return { stdout: "lock timeout patched" }; } })
    .register({ name: "verify_orders", execute: async () => { calls.push("verify"); return { stdout: "orders advanced beyond processing" }; } });
  const first = await registry.execute("missing_log_tool", {});
  assert.equal(first.success, false);
  for (const name of ["inspect_cron", "patch_worker", "verify_orders"]) assert.equal((await registry.execute(name, {})).success, true);
  const guard = completionGuard({ changed: true, requiredItems: calls.map((name) => ({ title: name, status: "completed" })), verification: [{ status: "passed", evidence: "orders advanced" }] });
  assert.deepEqual(calls, ["inspect", "patch", "verify"]); assert.equal(guard.complete, true);
});

test("migration set contains every durable runtime aggregate", () => {
  const sql = migrations.join("\n");
  for (const table of ["conversations", "conversation_messages", "coding_agent_runs", "agent_run_events", "agent_tasks", "agent_task_items", "agent_tool_calls", "agent_approvals", "agent_checkpoints", "agent_context_summaries", "agent_usage_ledger", "project_agent_memory"]) assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
});
