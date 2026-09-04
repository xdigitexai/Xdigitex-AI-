import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../index.mjs", import.meta.url), "utf8");

test("non-streaming planner does not reference an undeclared transport stream", () => {
  assert.doesNotMatch(source, /activeStream\s*=\s*stream\s*;/);
  assert.match(source, /const completion = await callWithRetry\(\)/);
});

test("server agent applies bounded cycle and command budgets", () => {
  assert.match(source, /const maxIterations = taskComplexity/);
  assert.match(source, /const maxCommands = taskComplexity/);
  assert.match(source, /No-progress loop detected/);
});

test("runtime failures log correlated stack details but return a safe message", () => {
  assert.match(source, /\[server-agent-runtime\]/);
  assert.match(source, /stack: err instanceof Error \? err\.stack/);
  assert.match(source, /return "Internal agent runtime error\."/);
});

test("simple known-file work uses the fast path and skips generic knowledge", () => {
  assert.match(source, /const simpleTaskFastPath =/);
  assert.match(source, /Inspect this exact source file first/);
  assert.match(source, /simpleTaskFastPath \? Promise\.resolve\(\[\]\)/);
  assert.match(source, /taskComplexity === "simple" \? 1 : 3/);
});

test("shell exit semantics do not turn grep no-match into repair failure", () => {
  assert.match(source, /commandName === "grep" && result\.code === 1 \? "NO_MATCH"/);
  assert.match(source, /commandName === "grep" && result\.code === 2 \? "TOOL_SYNTAX_ERROR"/);
  assert.match(source, /toolClassification === "COMMAND_FAILURE"/);
});

test("read-only command results are cached until a successful mutation", () => {
  assert.match(source, /const commandResultCache/);
  assert.match(source, /commandResultCache\.has\(cacheKey\)/);
  assert.match(source, /mutationEpoch\+\+/);
});

test("budget exhaustion requests completion evaluation before partial status", () => {
  assert.match(source, /RUN-WIDE COMMAND BUDGET REACHED/);
  assert.match(source, /If satisfied, respond action="done"/);
  assert.match(source, /budgetFinalizationRequested/);
});

test("canonical server chat routes validate user and server ownership", () => {
  assert.match(source, /\/:id\/conversations\/:conversationId/);
  assert.match(source, /c\.server_id=\$2 AND c\.user_id=\$3/);
  assert.match(source, /canonicalUrl: `\/servers\/\$\{serverId\}\/chats\//);
  assert.match(source, /Math\.min\(2147483647/);
});

test("message idempotency and final-response hygiene protect chat UX", () => {
  assert.match(source, /agent_message_idempotency/);
  assert.match(source, /clientMessageId/);
  assert.match(source, /Preparing the final response/);
  assert.match(source, /conciseConversationTitle/);
});

test("domain-bound tasks verify the hostname instead of the SSH address", () => {
  assert.match(source, /\[DOMAIN TARGET BINDING\]/);
  assert.match(source, /raw IP does not mean the requested domain failed/);
  assert.match(source, /curl --resolve/);
  assert.match(source, /grep -nF/);
  assert.match(source, /Automation was not requested/);
});

test("test, terminal, and agent share saved server credential execution", () => {
  assert.match(source, /function executeServerCommand\(server/);
  assert.match(source, /executeServerCommand\(s2, "uname -a/);
  assert.match(source, /executeServerCommand\(s2, parsed\.data\.command\)/);
  assert.match(source, /executeServerCommand\(s2, cmd,/);
  assert.match(source, /CONNECTION_WRAPPER_REJECTED/);
  assert.match(source, /SSH_AUTH_FAILED/);
});

test("normal execution hides orchestration noise and uses a real deployment plan", () => {
  assert.match(source, /Primary AI provider unavailable\. Continuing with backup model/);
  assert.match(source, /Knowledge Base:\|Crawl complete/);
  assert.match(source, /Inspect current deployment/);
  assert.match(source, /Configure domain and TLS/);
});

test("durable TODO progress advances from the authenticated connection", () => {
  assert.match(source, /async function completeRunTask\(task, evidence\)/);
  assert.match(source, /status='completed',evidence=\$2/);
  assert.match(source, /await executeServerCommand\(s2, "printf XDIGITEX_CONNECTED"/);
  assert.match(source, /await completeRunTask\(task, \{ connection: "authenticated"/);
  assert.match(source, /await completeRunTask\(task, \{ commandBatch: "completed"/);
});

test("timeouts are task-aware and distinct from generic failures", () => {
  assert.match(source, /timeout 900/);
  assert.match(source, /result\.code === 124 \? "COMMAND_TIMEOUT"/);
  assert.match(source, /COMMAND_FAILURE\|COMMAND_TIMEOUT/);
});

test("discoveries expand the persisted TODO without duplicates", () => {
  assert.match(source, /async function addRunTasks\(task, titles, reason\)/);
  assert.match(source, /lower\(regexp_replace\(title/);
  assert.match(source, /Application database requirement detected/);
  assert.match(source, /Configure application DATABASE_URL/);
  assert.match(source, /todo_discovered: "todo\.created"/);
  assert.match(source, /\[DURABLE TODO GATE\]/);
});

test("run target context persists safe project metadata", () => {
  assert.match(source, /const targetContext = \{ targetType:/);
  assert.match(source, /target_context: "target\.updated"/);
  assert.match(source, /databaseType = "PostgreSQL"/);
  assert.match(source, /todo_items,/);
});
