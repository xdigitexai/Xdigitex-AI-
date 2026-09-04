import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

export const TERMINAL_RUN_STATES = new Set(["completed", "failed", "cancelled", "insufficient_credits"]);
export const RUN_TRANSITIONS = Object.freeze({
  queued: new Set(["running", "cancelled", "insufficient_credits"]),
  running: new Set(["waiting", "completed", "failed", "cancelled", "insufficient_credits"]),
  waiting: new Set(["queued", "running", "cancelled", "insufficient_credits"]),
  failed: new Set(["queued"]), cancelled: new Set(["queued"]), insufficient_credits: new Set(["queued"]), completed: new Set(["queued"]),
});

const SENSITIVE = /(authorization|api[-_]?key|password|passwd|secret|token|private[-_]?key)/i;
const FORBIDDEN_SSH = /(?:sshd_config|\bssh(?:d)?\s+.*(?:port|permitrootlogin|passwordauthentication)|\bufw\b|\biptables\b|\bfirewall-cmd\b)/i;
const HIGH_RISK = /(?:\brm\s+-[^\n]*r|\bDROP\s+(?:DATABASE|SCHEMA|TABLE)|\bTRUNCATE\b|git\s+reset\s+--hard|git\s+push\s+(?:-f|--force)|\bmkfs\b|\bdd\s+.*of=\/dev\/)/i;

export function redactSecrets(value) {
  if (typeof value === "string") return value
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+/gi, "$1[REDACTED]")
    .replace(/((?:api[-_]?key|password|secret|token)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SENSITIVE.test(k) ? "[REDACTED]" : redactSecrets(v)]));
  return value;
}

export function classifyCommand(command) {
  if (FORBIDDEN_SSH.test(command)) return { risk: "high", reason: "Protected SSH or firewall configuration", alwaysRequireApproval: true };
  if (HIGH_RISK.test(command)) return { risk: "high", reason: "Destructive command", alwaysRequireApproval: true };
  if (/\b(?:npm|pnpm|yarn|composer|pip)\s+install\b|\b(?:systemctl|service|pm2)\s+(?:restart|reload)\b/i.test(command)) return { risk: "medium", reason: "Changes dependencies or a running service" };
  return { risk: "low", reason: "Read-only or routine operation" };
}

export class ToolRegistry {
  #tools = new Map();
  register(definition) {
    if (!definition?.name || typeof definition.execute !== "function") throw new Error("Tool requires name and execute handler");
    if (this.#tools.has(definition.name)) throw new Error(`Duplicate tool: ${definition.name}`);
    this.#tools.set(definition.name, Object.freeze({ timeoutMs: 30_000, risk: "low", permissions: [], inputSchema: {}, ...definition }));
    return this;
  }
  get(name) { return this.#tools.get(name); }
  list() { return [...this.#tools.values()].map(({ execute, ...meta }) => meta); }
  async execute(name, input, context = {}) {
    const tool = this.get(name);
    if (!tool) return { success: false, status: "failed", exitCode: null, stdout: "", stderr: `Unknown tool: ${name}`, durationMs: 0, metadata: {} };
    const started = Date.now();
    const controller = new AbortController();
    const onAbort = () => controller.abort(context.signal?.reason);
    context.signal?.addEventListener("abort", onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(new Error("timeout")), tool.timeoutMs);
    try {
      const result = await tool.execute(input ?? {}, { ...context, signal: controller.signal });
      return redactSecrets({ success: true, status: "completed", exitCode: result?.exitCode ?? 0, stdout: result?.stdout ?? "", stderr: result?.stderr ?? "", durationMs: Date.now() - started, metadata: result?.metadata ?? {} });
    } catch (error) {
      const timeout = controller.signal.aborted && !context.signal?.aborted;
      return redactSecrets({ success: false, status: context.signal?.aborted ? "cancelled" : timeout ? "timeout" : "failed", exitCode: error?.exitCode ?? null, stdout: error?.stdout ?? "", stderr: String(error?.message ?? error), durationMs: Date.now() - started, metadata: {} });
    } finally {
      clearTimeout(timer); context.signal?.removeEventListener("abort", onAbort);
    }
  }
}

function spawnCommand(command, { cwd, env, signal }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd, env, signal, shell: true, windowsHide: true });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; }); child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject); child.on("close", (exitCode) => resolve({ exitCode, stdout, stderr }));
  });
}

export function createDefaultToolRegistry({ workspaceRoot = process.cwd() } = {}) {
  const root = path.resolve(workspaceRoot);
  const safePath = (relative = ".") => { const resolved = path.resolve(root, relative); if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Path escapes workspace"); return resolved; };
  return new ToolRegistry()
    .register({ name: "read_file", description: "Read a workspace file", inputSchema: { path: "string" }, execute: async ({ path: p }) => ({ stdout: await readFile(safePath(p), "utf8"), metadata: { path: p } }) })
    .register({ name: "list_directory", description: "List a workspace directory", inputSchema: { path: "string" }, execute: async ({ path: p = "." }) => ({ stdout: (await readdir(safePath(p))).join("\n"), metadata: { path: p } }) })
    .register({ name: "search_files", description: "Find file names recursively", inputSchema: { path: "string", query: "string" }, timeoutMs: 15_000, execute: async ({ path: p = ".", query = "" }) => { const found = []; const walk = async (dir) => { for (const name of await readdir(dir)) { if ([".git", "node_modules"].includes(name)) continue; const full = path.join(dir, name); const s = await stat(full); if (s.isDirectory()) await walk(full); else if (name.toLowerCase().includes(query.toLowerCase())) found.push(path.relative(root, full)); if (found.length >= 200) return; } }; await walk(safePath(p)); return { stdout: found.join("\n"), metadata: { count: found.length } }; } })
    .register({ name: "shell", description: "Run a command in the workspace", inputSchema: { command: "string", cwd: "string" }, timeoutMs: 120_000, risk: "dynamic", execute: async ({ command, cwd = ".", env = {} }, ctx) => { if (!command) throw new Error("command is required"); const classification = classifyCommand(command); if (classification.alwaysRequireApproval && !ctx.approved) throw new Error(`Approval required: ${classification.reason}`); const allowedEnv = Object.fromEntries(Object.entries(env).filter(([k]) => /^(?:CI|NODE_ENV|PORT|DEBUG|FORCE_COLOR)$/.test(k))); return spawnCommand(command, { cwd: safePath(cwd), env: { ...process.env, ...allowedEnv }, signal: ctx.signal }); } });
}

export class ProviderRegistry {
  #providers = new Map();
  register(provider) { for (const name of ["complete", "normalizeUsage", "listModels", "healthCheck"]) if (typeof provider?.[name] !== "function") throw new Error(`Provider missing ${name}`); this.#providers.set(provider.name, provider); return this; }
  get(name) { const provider = this.#providers.get(name); if (!provider) throw new Error(`Provider unavailable: ${name}`); return provider; }
  list() { return [...this.#providers.values()].map((p) => ({ name: p.name, models: p.listModels() })); }
}

export function createOpenAICompatibleProvider({ name, baseUrl, apiKey, models }) {
  return { name, listModels: () => models, async healthCheck() { return { ok: Boolean(apiKey) }; }, normalizeUsage(u = {}) { return { inputTokens: u.prompt_tokens ?? u.input_tokens ?? 0, outputTokens: u.completion_tokens ?? u.output_tokens ?? 0, cachedTokens: u.prompt_tokens_details?.cached_tokens ?? u.input_tokens_details?.cached_tokens ?? 0, reasoningTokens: u.completion_tokens_details?.reasoning_tokens ?? u.output_tokens_details?.reasoning_tokens ?? 0 }; }, async complete({ model, messages, tools, signal }) { if (!apiKey) throw new Error(`${name} API key is not configured`); const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, { method: "POST", signal, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" }, body: JSON.stringify({ model, messages, tools, tool_choice: tools?.length ? "auto" : undefined }) }); const body = await response.json(); if (!response.ok) throw new Error(`${name} request failed (${response.status}): ${body?.error?.message ?? "unknown error"}`); return { id: body.id, message: body.choices?.[0]?.message ?? { role: "assistant", content: "" }, usage: this.normalizeUsage(body.usage) }; } };
}

export function chooseModel(kind, available) {
  const preferences = kind === "summarization" || kind === "quick" ? ["mini", "flash", "haiku"] : kind === "coding" || kind === "debugging" ? ["codex", "sonnet", "gpt-5", "deepseek"] : ["gpt", "claude", "deepseek"];
  return available.find((m) => preferences.some((p) => m.toLowerCase().includes(p))) ?? available[0];
}

export const migrations = [
`CREATE TABLE IF NOT EXISTS conversations (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL, server_id INTEGER REFERENCES servers(id) ON DELETE SET NULL, workspace_id TEXT, status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')), metadata JSONB NOT NULL DEFAULT '{}', last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE INDEX IF NOT EXISTS conversations_user_last_idx ON conversations(user_id,last_message_at DESC)`,
`CREATE TABLE IF NOT EXISTS coding_agent_runs (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, parent_run_id BIGINT REFERENCES coding_agent_runs(id), status TEXT NOT NULL DEFAULT 'queued', phase TEXT NOT NULL DEFAULT 'queued', attempt INTEGER NOT NULL DEFAULT 1, lock_token TEXT, idempotency_key TEXT, cancellation_requested_at TIMESTAMPTZ, heartbeat_at TIMESTAMPTZ, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, error TEXT, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id,idempotency_key))`,
`CREATE TABLE IF NOT EXISTS conversation_messages (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, run_id BIGINT REFERENCES coding_agent_runs(id) ON DELETE SET NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant','system','tool')), content TEXT NOT NULL, content_type TEXT NOT NULL DEFAULT 'text', sequence INTEGER NOT NULL, model TEXT, provider TEXT, token_usage JSONB, credit_usage NUMERIC(14,6), metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(conversation_id,sequence))`,
`CREATE TABLE IF NOT EXISTS agent_run_events (id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(run_id,sequence))`,
`CREATE TABLE IF NOT EXISTS agent_tasks (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, run_id BIGINT REFERENCES coding_agent_runs(id) ON DELETE SET NULL, goal TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'in_progress', acceptance_criteria JSONB NOT NULL DEFAULT '[]', metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE TABLE IF NOT EXISTS agent_task_items (id BIGSERIAL PRIMARY KEY, task_id BIGINT NOT NULL REFERENCES agent_tasks(id) ON DELETE CASCADE, position INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', required BOOLEAN NOT NULL DEFAULT TRUE, evidence JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(task_id,position))`,
`CREATE TABLE IF NOT EXISTS agent_tool_calls (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, run_id BIGINT NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', risk TEXT NOT NULL DEFAULT 'low', input JSONB NOT NULL DEFAULT '{}', result JSONB, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, duration_ms INTEGER, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE TABLE IF NOT EXISTS agent_approvals (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, tool_call_id BIGINT NOT NULL REFERENCES agent_tool_calls(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, status TEXT NOT NULL DEFAULT 'pending', original_input JSONB NOT NULL, edited_input JSONB, decided_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE TABLE IF NOT EXISTS agent_checkpoints (id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE, sequence INTEGER NOT NULL, reason TEXT NOT NULL, snapshot JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(run_id,sequence))`,
`CREATE TABLE IF NOT EXISTS agent_context_summaries (id BIGSERIAL PRIMARY KEY, conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, through_sequence INTEGER NOT NULL, summary TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE TABLE IF NOT EXISTS agent_usage_ledger (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), conversation_id BIGINT REFERENCES conversations(id), run_id BIGINT REFERENCES coding_agent_runs(id), provider TEXT NOT NULL, model TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, cached_tokens INTEGER NOT NULL DEFAULT 0, reasoning_tokens INTEGER NOT NULL DEFAULT 0, provider_cost NUMERIC(14,8) NOT NULL DEFAULT 0, charged_credits NUMERIC(14,6) NOT NULL DEFAULT 0, reserved_credits NUMERIC(14,6) NOT NULL DEFAULT 0, balance_before NUMERIC(14,6) NOT NULL, balance_after NUMERIC(14,6) NOT NULL, status TEXT NOT NULL, provider_request_id TEXT, idempotency_key TEXT UNIQUE NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE TABLE IF NOT EXISTS project_agent_memory (id BIGSERIAL PRIMARY KEY, project_id INTEGER UNIQUE NOT NULL REFERENCES projects(id) ON DELETE CASCADE, stack JSONB NOT NULL DEFAULT '[]', commands JSONB NOT NULL DEFAULT '{}', directories JSONB NOT NULL DEFAULT '[]', environments JSONB NOT NULL DEFAULT '[]', deployment JSONB NOT NULL DEFAULT '{}', repository_index JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];

export class RuntimeStore {
  constructor(pool) { this.pool = pool; }
  async migrate() { for (const sql of migrations) await this.pool.query(sql); }
  async transaction(fn) { const client = await this.pool.connect(); try { await client.query("BEGIN"); const result = await fn(client); await client.query("COMMIT"); return result; } catch (e) { await client.query("ROLLBACK"); throw e; } finally { client.release(); } }
  async emit(runId, type, payload = {}, client = this.pool) { const r = await client.query(`INSERT INTO agent_run_events(run_id,sequence,type,payload) SELECT $1,COALESCE(MAX(sequence),0)+1,$2,$3 FROM agent_run_events WHERE run_id=$1 RETURNING *`, [runId, type, JSON.stringify(redactSecrets(payload))]); return r.rows[0]; }
  async transition(runId, from, to, extra = {}, client = this.pool) { if (!RUN_TRANSITIONS[from]?.has(to)) throw new Error(`Invalid run transition ${from} -> ${to}`); const r = await client.query(`UPDATE coding_agent_runs SET status=$3,phase=COALESCE($4,phase),error=COALESCE($5,error),heartbeat_at=NOW(),updated_at=NOW(),completed_at=CASE WHEN $3=ANY($6) THEN NOW() ELSE completed_at END WHERE id=$1 AND status=$2 RETURNING *`, [runId, from, to, extra.phase ?? null, extra.error ?? null, [...TERMINAL_RUN_STATES]]); if (!r.rowCount) throw new Error("Run state changed concurrently"); return r.rows[0]; }
  async reserveCredits({ userId, conversationId, runId, provider, model, amount, idempotencyKey }) { return this.transaction(async (c) => { const existing = await c.query(`SELECT * FROM agent_usage_ledger WHERE idempotency_key=$1`, [idempotencyKey]); if (existing.rowCount) return existing.rows[0]; const user = await c.query(`SELECT credits::numeric AS credits FROM users WHERE id=$1 FOR UPDATE`, [userId]); if (!user.rowCount) throw new Error("User not found"); const before = Number(user.rows[0].credits); if (before <= 0 || before < amount) return null; const after = before - amount; await c.query(`UPDATE users SET credits=$2,updated_at=NOW() WHERE id=$1`, [userId, after]); const row = await c.query(`INSERT INTO agent_usage_ledger(public_id,user_id,conversation_id,run_id,provider,model,reserved_credits,balance_before,balance_after,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'reserved',$10) RETURNING *`, [randomUUID(), userId, conversationId, runId, provider, model, amount, before, after, idempotencyKey]); return row.rows[0]; }); }
  async settleCredits({ ledgerId, usage, actualCredits, providerRequestId }) { return this.transaction(async (c) => { const l = await c.query(`SELECT * FROM agent_usage_ledger WHERE id=$1 FOR UPDATE`, [ledgerId]); if (!l.rowCount || l.rows[0].status === "settled") return l.rows[0]; const reserved = Number(l.rows[0].reserved_credits), delta = reserved - actualCredits; const user = await c.query(`UPDATE users SET credits=credits+$2,updated_at=NOW() WHERE id=$1 RETURNING credits`, [l.rows[0].user_id, delta]); const row = await c.query(`UPDATE agent_usage_ledger SET input_tokens=$2,output_tokens=$3,cached_tokens=$4,reasoning_tokens=$5,charged_credits=$6,balance_after=$7,status='settled',provider_request_id=$8,updated_at=NOW() WHERE id=$1 RETURNING *`, [ledgerId, usage.inputTokens, usage.outputTokens, usage.cachedTokens, usage.reasoningTokens, actualCredits, user.rows[0].credits, providerRequestId ?? null]); return row.rows[0]; }); }
}

function inferTaskKind(text) {
  if (/\b(?:fix|debug|error|broken|failing)\b/i.test(text)) return "debugging";
  if (/\b(?:build|implement|create|change|add|deploy|install|cron)\b/i.test(text)) return "coding";
  return "quick";
}

function defaultPlan(text) {
  const change = inferTaskKind(text) !== "quick";
  return change
    ? ["Inspect the current state", "Implement the requested change", "Verify the result", "Report factual results"]
    : ["Understand the request", "Produce and verify the answer"];
}

export class DurableAgentWorker {
  constructor({ pool, providers, tools, pollMs = 1_000, reservationCredits = 1, maxIterations = 24 }) {
    this.pool = pool; this.store = new RuntimeStore(pool); this.providers = providers; this.tools = tools;
    this.pollMs = pollMs; this.reservationCredits = reservationCredits; this.maxIterations = maxIterations;
    this.timer = null; this.running = false; this.controllers = new Map();
  }
  start() { if (!this.timer) { this.timer = setInterval(() => this.tick().catch(() => {}), this.pollMs); this.timer.unref?.(); this.tick().catch(() => {}); } }
  stop() { clearInterval(this.timer); this.timer = null; for (const c of this.controllers.values()) c.abort(); }
  async claim() { return this.store.transaction(async (c) => { const selected = await c.query(`SELECT id FROM coding_agent_runs WHERE status='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1`); if (!selected.rowCount) return null; const token = randomUUID(); const row = await c.query(`UPDATE coding_agent_runs SET status='running',phase='context',lock_token=$2,started_at=COALESCE(started_at,NOW()),heartbeat_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *`, [selected.rows[0].id, token]); await this.store.emit(row.rows[0].id, "run.started", { phase: "context" }, c); return row.rows[0]; }); }
  async tick() { if (this.running) return; this.running = true; try { const run = await this.claim(); if (run) await this.execute(run); } finally { this.running = false; } }
  async finish(run, status, payload = {}) { const current = (await this.pool.query("SELECT status FROM coding_agent_runs WHERE id=$1", [run.id])).rows[0]?.status; if (current === "running" || current === "waiting") await this.store.transition(run.id, current, status, { phase: status, error: payload.error }); await this.store.emit(run.id, `run.${status}`, payload); }
  async execute(run) {
    const controller = new AbortController(); this.controllers.set(run.id, controller);
    try {
      const data = await this.pool.query(`SELECT c.*,m.content request FROM conversations c JOIN conversation_messages m ON m.id=(SELECT id FROM conversation_messages WHERE conversation_id=c.id AND role='user' ORDER BY sequence DESC LIMIT 1) WHERE c.id=$1 AND c.user_id=$2`, [run.conversation_id, run.user_id]);
      if (!data.rowCount) throw new Error("Conversation or request is unavailable");
      const request = data.rows[0].request, kind = inferTaskKind(request), steps = defaultPlan(request);
      let task = (await this.pool.query("SELECT * FROM agent_tasks WHERE run_id=$1 ORDER BY id DESC LIMIT 1", [run.id])).rows[0];
      if (!task) { task = (await this.pool.query(`INSERT INTO agent_tasks(public_id,conversation_id,run_id,goal,acceptance_criteria) VALUES($1,$2,$3,$4,$5) RETURNING *`, [randomUUID(), run.conversation_id, run.id, request, JSON.stringify(steps.map((title) => ({ title, required: true })))] )).rows[0]; for (let i = 0; i < steps.length; i++) await this.pool.query("INSERT INTO agent_task_items(task_id,position,title) VALUES($1,$2,$3)", [task.id, i + 1, steps[i]]); await this.store.emit(run.id, "todo.created", { taskId: task.public_id, items: steps }); }
      const history = (await this.pool.query(`SELECT role,content FROM conversation_messages WHERE conversation_id=$1 ORDER BY sequence DESC LIMIT 24`, [run.conversation_id])).rows.reverse();
      const providerList = this.providers.list(); if (!providerList.length) throw new Error("No AI provider configured");
      const providerMeta = providerList[0], provider = this.providers.get(providerMeta.name), model = chooseModel(kind, providerMeta.models);
      let messages = [{ role: "system", content: `You are XDIGITEX AI, a server-side autonomous coding agent. Continue taking concrete tool actions until the request is actually satisfied. Return tool calls using the available tools. Do not claim completion without verification. Never change SSH port, sshd_config, root/password authentication, or firewall rules unless the user explicitly requested it and approval is granted. Current durable TODO: ${steps.join("; ")}` }, ...history.map(({ role, content }) => ({ role, content }))];
      let usedTool = false;
      const approvedCalls = await this.pool.query(`SELECT tc.*,a.edited_input,a.status approval_status FROM agent_tool_calls tc JOIN agent_approvals a ON a.tool_call_id=tc.id WHERE tc.run_id=$1 AND tc.status='queued' AND a.status=ANY($2) ORDER BY tc.id`, [run.id, ["approved", "edited"]]);
      for (const tc of approvedCalls.rows) {
        const approvedInput = tc.edited_input ?? tc.input;
        const result = await this.tools.execute(tc.name, approvedInput, { signal: controller.signal, run, approved: true }); usedTool = true;
        await this.pool.query("UPDATE agent_tool_calls SET status=$2,result=$3,duration_ms=$4,started_at=COALESCE(started_at,NOW()),completed_at=NOW() WHERE id=$1", [tc.id, result.status, JSON.stringify(result), result.durationMs]);
        await this.store.emit(run.id, result.success ? "tool.completed" : "tool.failed", { toolCallId: tc.public_id, name: tc.name, result });
        messages.push({ role: "system", content: `Approved tool ${tc.name} result: ${JSON.stringify(result)}` });
      }
      for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
        const fresh = (await this.pool.query("SELECT status,cancellation_requested_at FROM coding_agent_runs WHERE id=$1", [run.id])).rows[0];
        if (fresh?.cancellation_requested_at) { controller.abort(); await this.finish(run, "cancelled", { reason: "user_requested" }); return; }
        if (fresh?.status !== "running") return;
        await this.pool.query("UPDATE coding_agent_runs SET heartbeat_at=NOW(),phase='model',updated_at=NOW() WHERE id=$1", [run.id]);
        const ledger = await this.store.reserveCredits({ userId: run.user_id, conversationId: run.conversation_id, runId: run.id, provider: provider.name, model, amount: this.reservationCredits, idempotencyKey: `${run.public_id}:model:${iteration}` });
        if (!ledger) { await this.checkpoint(run.id, "insufficient_credits", { iteration, steps }); await this.finish(run, "insufficient_credits", { iteration }); return; }
        let response;
        try { response = await provider.complete({ model, messages, tools: this.tools.list().map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: Object.fromEntries(Object.keys(t.inputSchema ?? {}).map((k) => [k, { type: "string" }])) } } })), signal: controller.signal }); }
        catch (error) { await this.store.settleCredits({ ledgerId: ledger.id, usage: { inputTokens:0,outputTokens:0,cachedTokens:0,reasoningTokens:0 }, actualCredits: 0 }); throw error; }
        const actual = Math.min(this.reservationCredits, Math.max(0.01, Math.ceil((response.usage.inputTokens + response.usage.outputTokens) / 1000) / 100));
        const settled = await this.store.settleCredits({ ledgerId: ledger.id, usage: response.usage, actualCredits: actual, providerRequestId: response.id });
        await this.store.emit(run.id, "credit.updated", { credits: Number(settled.balance_after), usage: response.usage });
        const toolCalls = response.message.tool_calls ?? [];
        if (toolCalls.length) {
          messages.push(response.message);
          for (const call of toolCalls) {
            let input = {}; try { input = JSON.parse(call.function?.arguments || "{}"); } catch {}
            const tool = this.tools.get(call.function?.name), classification = call.function?.name === "shell" ? classifyCommand(input.command ?? "") : { risk: tool?.risk ?? "low", alwaysRequireApproval: tool?.risk === "high", reason: "High-risk tool" };
            const tc = (await this.pool.query(`INSERT INTO agent_tool_calls(public_id,run_id,name,status,risk,input,started_at) VALUES($1,$2,$3,$4,$5,$6,NOW()) RETURNING *`, [randomUUID(), run.id, call.function?.name, classification.alwaysRequireApproval ? "waiting_approval" : "running", classification.risk, JSON.stringify(redactSecrets(input))])).rows[0];
            await this.store.emit(run.id, "tool.started", { toolCallId: tc.public_id, name: tc.name, input, risk: classification.risk });
            if (classification.alwaysRequireApproval) { const approval = (await this.pool.query(`INSERT INTO agent_approvals(public_id,tool_call_id,user_id,original_input) VALUES($1,$2,$3,$4) RETURNING *`, [randomUUID(), tc.id, run.user_id, JSON.stringify(redactSecrets(input))])).rows[0]; await this.store.emit(run.id, "run.waiting", { reason: "approval", approvalId: approval.public_id, toolCallId: tc.public_id }); await this.checkpoint(run.id, "waiting_approval", { iteration, taskId: task.public_id }); await this.store.transition(run.id, "running", "waiting", { phase: "approval" }); return; }
            const result = await this.tools.execute(tc.name, input, { signal: controller.signal, run }); usedTool = true;
            await this.pool.query("UPDATE agent_tool_calls SET status=$2,result=$3,duration_ms=$4,completed_at=NOW() WHERE id=$1", [tc.id, result.status, JSON.stringify(result), result.durationMs]);
            await this.store.emit(run.id, result.success ? "tool.completed" : "tool.failed", { toolCallId: tc.public_id, name: tc.name, result });
            messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
          }
          await this.pool.query("UPDATE agent_task_items SET status='completed',evidence=$2,updated_at=NOW() WHERE task_id=$1 AND position=1", [task.id, JSON.stringify({ toolExecution: true })]);
          await this.store.emit(run.id, "todo.updated", { position: 1, status: "completed" });
          continue;
        }
        const content = String(response.message.content ?? "").trim();
        if (!content) continue;
        const finalAllowed = kind === "quick" || usedTool;
        if (!finalAllowed) { messages.push({ role: "assistant", content }, { role: "system", content: "You have not performed any concrete action. Continue with tools; planning text is not completion." }); continue; }
        await this.pool.query("UPDATE agent_task_items SET status='completed',evidence=$2,updated_at=NOW() WHERE task_id=$1", [task.id, JSON.stringify({ agentCompleted: true, usedTool })]);
        const seq = (await this.pool.query("SELECT COALESCE(MAX(sequence),0)+1 n FROM conversation_messages WHERE conversation_id=$1", [run.conversation_id])).rows[0].n;
        await this.pool.query(`INSERT INTO conversation_messages(public_id,conversation_id,run_id,role,content,sequence,model,provider,token_usage,credit_usage) VALUES($1,$2,$3,'assistant',$4,$5,$6,$7,$8,$9)`, [randomUUID(), run.conversation_id, run.id, content, seq, model, provider.name, JSON.stringify(response.usage), actual]);
        await this.pool.query("UPDATE agent_tasks SET status='completed',updated_at=NOW() WHERE id=$1", [task.id]); await this.store.emit(run.id, "assistant.message", { content, model, provider: provider.name }); await this.checkpoint(run.id, "completed", { taskId: task.public_id, iteration, usedTool }); await this.finish(run, "completed", { iterations: iteration }); return;
      }
      await this.checkpoint(run.id, "iteration_limit", { maxIterations: this.maxIterations }); await this.finish(run, "failed", { error: "Agent iteration limit reached" });
    } catch (error) { if (!controller.signal.aborted) { await this.checkpoint(run.id, "failure", { error: String(error?.message ?? error) }).catch(() => {}); await this.finish(run, "failed", { error: String(error?.message ?? error) }).catch(() => {}); } }
    finally { this.controllers.delete(run.id); }
  }
  async checkpoint(runId, reason, snapshot) { const n = (await this.pool.query("SELECT COALESCE(MAX(sequence),0)+1 n FROM agent_checkpoints WHERE run_id=$1", [runId])).rows[0].n; await this.pool.query("INSERT INTO agent_checkpoints(run_id,sequence,reason,snapshot) VALUES($1,$2,$3,$4)", [runId, n, reason, JSON.stringify(redactSecrets(snapshot))]); await this.store.emit(runId, "checkpoint.created", { sequence: n, reason }); }
}

function authUserId(req) { const match = String(req.headers.authorization ?? "").match(/^Bearer\s+mock-token-(\d+)$/); return match ? Number(match[1]) : null; }
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const page = (n, fallback, max) => Math.max(1, Math.min(max, Number(n) || fallback));

export async function installAgentRuntime(app, pool, options = {}) {
  const store = new RuntimeStore(pool); await store.migrate();
  const providers = options.providers ?? new ProviderRegistry();
  if (!options.providers) {
    if (process.env.OPENAI_API_KEY) providers.register(createOpenAICompatibleProvider({ name: "openai", baseUrl: "https://api.openai.com/v1", apiKey: process.env.OPENAI_API_KEY, models: [process.env.AGENT_MODEL || "gpt-4o-mini"] }));
    if (process.env.DEEPSEEK_API_KEY) providers.register(createOpenAICompatibleProvider({ name: "deepseek", baseUrl: "https://api.deepseek.com/v1", apiKey: process.env.DEEPSEEK_API_KEY, models: [process.env.DEEPSEEK_AGENT_MODEL || "deepseek-chat"] }));
    if (process.env.XAI_API_KEY) providers.register(createOpenAICompatibleProvider({ name: "xai", baseUrl: "https://api.x.ai/v1", apiKey: process.env.XAI_API_KEY, models: [process.env.XAI_AGENT_MODEL || "grok-4"] }));
  }
  const worker = options.worker ?? new DurableAgentWorker({ pool, providers, tools: options.tools ?? createDefaultToolRegistry({ workspaceRoot: process.env.AGENT_WORKSPACE_ROOT || process.cwd() }) });
  if (options.startWorker !== false) worker.start();
  const prefix = options.prefix ?? "/api";
  const auth = asyncRoute(async (req, res, next) => { const userId = authUserId(req); if (!userId) return res.status(401).json({ error: "Not authenticated" }); const u = await pool.query("SELECT id,credits FROM users WHERE id=$1", [userId]); if (!u.rowCount) return res.status(401).json({ error: "Not authenticated" }); req.agentUser = u.rows[0]; next(); });
  const ownConversation = async (publicId, userId) => (await pool.query("SELECT * FROM conversations WHERE public_id=$1 AND user_id=$2", [publicId, userId])).rows[0];
  const ownRun = async (publicId, userId) => (await pool.query("SELECT r.* FROM coding_agent_runs r WHERE r.public_id=$1 AND r.user_id=$2", [publicId, userId])).rows[0];

  app.get(`${prefix}/conversations`, auth, asyncRoute(async (req, res) => { const limit = page(req.query.limit, 30, 100), offset = Math.max(0, Number(req.query.offset) || 0); const values = [req.agentUser.id]; const where = ["c.user_id=$1"]; if (req.query.status) { values.push(req.query.status); where.push(`c.status=$${values.length}`); } if (req.query.projectId) { values.push(Number(req.query.projectId)); where.push(`c.project_id=$${values.length}`); } if (req.query.serverId) { values.push(Number(req.query.serverId)); where.push(`c.server_id=$${values.length}`); } if (req.query.search) { values.push(`%${req.query.search}%`); where.push(`(c.title ILIKE $${values.length} OR EXISTS(SELECT 1 FROM conversation_messages m WHERE m.conversation_id=c.id AND m.content ILIKE $${values.length}))`); } values.push(limit, offset); const rows = await pool.query(`SELECT c.*, (SELECT content FROM conversation_messages m WHERE m.conversation_id=c.id ORDER BY sequence DESC LIMIT 1) last_message_preview, (SELECT status FROM coding_agent_runs r WHERE r.conversation_id=c.id ORDER BY id DESC LIMIT 1) last_run_status FROM conversations c WHERE ${where.join(" AND ")} ORDER BY c.last_message_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values); res.json({ items: rows.rows, limit, offset, hasMore: rows.rowCount === limit }); }));
  app.post(`${prefix}/conversations`, auth, asyncRoute(async (req, res) => { const title = String(req.body.title || "New conversation").slice(0, 255); const row = await pool.query(`INSERT INTO conversations(public_id,user_id,title,project_id,server_id,workspace_id,metadata) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`, [randomUUID(), req.agentUser.id, title, req.body.projectId ?? null, req.body.serverId ?? null, req.body.workspaceId ?? null, JSON.stringify(req.body.metadata ?? {})]); res.status(201).json(row.rows[0]); }));
  app.get(`${prefix}/conversations/:conversationId`, auth, asyncRoute(async (req, res) => { const c = await ownConversation(req.params.conversationId, req.agentUser.id); if (!c) return res.status(404).json({ error: "Conversation not found" }); const messages = await pool.query("SELECT * FROM conversation_messages WHERE conversation_id=$1 ORDER BY sequence", [c.id]); const runs = await pool.query("SELECT * FROM coding_agent_runs WHERE conversation_id=$1 ORDER BY id DESC LIMIT 50", [c.id]); res.json({ ...c, messages: messages.rows, runs: runs.rows }); }));
  app.patch(`${prefix}/conversations/:conversationId`, auth, asyncRoute(async (req, res) => { const c = await ownConversation(req.params.conversationId, req.agentUser.id); if (!c) return res.status(404).json({ error: "Conversation not found" }); const status = req.body.status && ["active", "archived"].includes(req.body.status) ? req.body.status : c.status; const row = await pool.query("UPDATE conversations SET title=$2,status=$3,updated_at=NOW() WHERE id=$1 RETURNING *", [c.id, String(req.body.title ?? c.title).slice(0,255), status]); res.json(row.rows[0]); }));
  app.delete(`${prefix}/conversations/:conversationId`, auth, asyncRoute(async (req, res) => { const c = await ownConversation(req.params.conversationId, req.agentUser.id); if (!c) return res.status(404).json({ error: "Conversation not found" }); await pool.query("DELETE FROM conversations WHERE id=$1", [c.id]); res.status(204).end(); }));
  app.post(`${prefix}/conversations/:conversationId/messages`, auth, asyncRoute(async (req, res) => { const c = await ownConversation(req.params.conversationId, req.agentUser.id); if (!c) return res.status(404).json({ error: "Conversation not found" }); const content = String(req.body.content ?? "").trim(); if (!content) return res.status(400).json({ error: "content is required" }); const idempotencyKey = String(req.headers["idempotency-key"] ?? req.body.idempotencyKey ?? randomUUID()); const result = await store.transaction(async (client) => { const duplicate = await client.query("SELECT * FROM coding_agent_runs WHERE user_id=$1 AND idempotency_key=$2", [req.agentUser.id, idempotencyKey]); if (duplicate.rowCount) return { run: duplicate.rows[0], duplicate: true }; const seq = await client.query("SELECT COALESCE(MAX(sequence),0)+1 AS n FROM conversation_messages WHERE conversation_id=$1 FOR UPDATE", [c.id]); const message = await client.query(`INSERT INTO conversation_messages(public_id,conversation_id,role,content,sequence,metadata) VALUES($1,$2,'user',$3,$4,$5) RETURNING *`, [randomUUID(), c.id, content, seq.rows[0].n, JSON.stringify(req.body.metadata ?? {})]); const run = await client.query(`INSERT INTO coding_agent_runs(public_id,conversation_id,user_id,status,phase,idempotency_key,metadata) VALUES($1,$2,$3,'queued','queued',$4,$5) RETURNING *`, [randomUUID(), c.id, req.agentUser.id, idempotencyKey, JSON.stringify({ sourceMessageId: message.rows[0].id, continueFromRunId: req.body.continueFromRunId ?? null })]); await client.query("UPDATE conversation_messages SET run_id=$2 WHERE id=$1", [message.rows[0].id, run.rows[0].id]); await client.query("UPDATE conversations SET last_message_at=NOW(),updated_at=NOW(),title=CASE WHEN title='New conversation' THEN LEFT($2,80) ELSE title END WHERE id=$1", [c.id, content]); await store.emit(run.rows[0].id, "run.created", { status: "queued" }, client); return { message: message.rows[0], run: run.rows[0], duplicate: false }; }); options.wakeWorker?.(); res.status(result.duplicate ? 200 : 202).json(result); }));
  app.get(`${prefix}/conversations/:conversationId/active-run`, auth, asyncRoute(async (req, res) => { const c = await ownConversation(req.params.conversationId, req.agentUser.id); if (!c) return res.status(404).json({ error: "Conversation not found" }); const row = await pool.query("SELECT * FROM coding_agent_runs WHERE conversation_id=$1 AND status=ANY($2) ORDER BY id DESC LIMIT 1", [c.id, ["queued","running","waiting"]]); res.json(row.rows[0] ?? null); }));
  app.get(`${prefix}/runs/:runId`, auth, asyncRoute(async (req, res) => { const run = await ownRun(req.params.runId, req.agentUser.id); if (!run) return res.status(404).json({ error: "Run not found" }); const [events, tasks, tools, checkpoints] = await Promise.all([pool.query("SELECT * FROM agent_run_events WHERE run_id=$1 ORDER BY sequence", [run.id]), pool.query("SELECT t.*,COALESCE(json_agg(i ORDER BY i.position) FILTER(WHERE i.id IS NOT NULL),'[]') items FROM agent_tasks t LEFT JOIN agent_task_items i ON i.task_id=t.id WHERE t.run_id=$1 GROUP BY t.id", [run.id]), pool.query("SELECT * FROM agent_tool_calls WHERE run_id=$1 ORDER BY id", [run.id]), pool.query("SELECT * FROM agent_checkpoints WHERE run_id=$1 ORDER BY sequence", [run.id])]); res.json({ ...run, events: events.rows, tasks: tasks.rows, toolCalls: tools.rows, checkpoints: checkpoints.rows }); }));
  app.get(`${prefix}/runs/:runId/events`, auth, asyncRoute(async (req, res) => { const run = await ownRun(req.params.runId, req.agentUser.id); if (!run) return res.status(404).end(); const after = Math.max(0, Number(req.headers["last-event-id"] ?? req.query.after) || 0); res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" }); let cursor = after, closed = false; req.on("close", () => { closed = true; }); const send = async () => { const events = await pool.query("SELECT * FROM agent_run_events WHERE run_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 200", [run.id, cursor]); for (const e of events.rows) { cursor = e.sequence; res.write(`id: ${e.sequence}\nevent: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`); } const status = (await pool.query("SELECT status FROM coding_agent_runs WHERE id=$1", [run.id])).rows[0]?.status; if (TERMINAL_RUN_STATES.has(status)) { res.write(`event: stream.end\ndata: ${JSON.stringify({ status })}\n\n`); res.end(); closed = true; } }; await send(); while (!closed) { await new Promise((r) => setTimeout(r, 1000)); await send(); } }));
  app.post(`${prefix}/runs/:runId/cancel`, auth, asyncRoute(async (req, res) => { const run = await ownRun(req.params.runId, req.agentUser.id); if (!run) return res.status(404).json({ error: "Run not found" }); if (TERMINAL_RUN_STATES.has(run.status)) return res.status(409).json({ error: "Run already finished" }); const row = await pool.query("UPDATE coding_agent_runs SET cancellation_requested_at=NOW(),updated_at=NOW() WHERE id=$1 RETURNING *", [run.id]); await store.emit(run.id, "run.cancellation_requested", {}); res.json(row.rows[0]); }));
  app.post(`${prefix}/runs/:runId/continue`, auth, asyncRoute(async (req, res) => { const prior = await ownRun(req.params.runId, req.agentUser.id); if (!prior) return res.status(404).json({ error: "Run not found" }); if (!TERMINAL_RUN_STATES.has(prior.status) && prior.status !== "waiting") return res.status(409).json({ error: "Run is already active" }); const key = String(req.headers["idempotency-key"] ?? randomUUID()); const row = await pool.query(`INSERT INTO coding_agent_runs(public_id,conversation_id,user_id,parent_run_id,status,phase,attempt,idempotency_key,metadata) VALUES($1,$2,$3,$4,'queued','resume',$5,$6,$7) ON CONFLICT(user_id,idempotency_key) DO UPDATE SET updated_at=NOW() RETURNING *`, [randomUUID(), prior.conversation_id, prior.user_id, prior.id, prior.attempt + 1, key, JSON.stringify({ mode: req.body.mode === "retry" ? "retry" : "continue" })]); await store.emit(row.rows[0].id, "run.created", { resumedFrom: prior.public_id }); options.wakeWorker?.(); res.status(202).json(row.rows[0]); }));
  app.post(`${prefix}/approvals/:approvalId`, auth, asyncRoute(async (req, res) => { const decision = req.body.decision; if (!["approved","rejected","edited"].includes(decision)) return res.status(400).json({ error: "Invalid decision" }); const row = await pool.query(`UPDATE agent_approvals a SET status=$3,edited_input=$4,decided_at=NOW() FROM agent_tool_calls tc JOIN coding_agent_runs r ON r.id=tc.run_id WHERE a.public_id=$1 AND a.tool_call_id=tc.id AND r.user_id=$2 AND a.status='pending' RETURNING a.*,tc.id tool_call_id,tc.run_id`, [req.params.approvalId, req.agentUser.id, decision, req.body.editedInput ? JSON.stringify(req.body.editedInput) : null]); if (!row.rowCount) return res.status(404).json({ error: "Pending approval not found" }); const approval = row.rows[0]; await pool.query(`UPDATE agent_tool_calls SET status=$2,completed_at=CASE WHEN $2='cancelled' THEN NOW() ELSE completed_at END WHERE id=$1`, [approval.tool_call_id, decision === "rejected" ? "cancelled" : "queued"]); await pool.query("UPDATE coding_agent_runs SET status='queued',phase='resume_approval',lock_token=NULL,updated_at=NOW() WHERE id=$1 AND status='waiting'", [approval.run_id]); await store.emit(approval.run_id, decision === "rejected" ? "approval.rejected" : "approval.decided", { approvalId: approval.public_id, decision }); options.wakeWorker?.(); res.json(approval); }));
  app.get(`${prefix}/credits`, auth, asyncRoute(async (req, res) => { const usage = await pool.query("SELECT * FROM agent_usage_ledger WHERE user_id=$1 ORDER BY id DESC LIMIT 50", [req.agentUser.id]); const user = await pool.query("SELECT credits FROM users WHERE id=$1", [req.agentUser.id]); res.json({ credits: Number(user.rows[0].credits), usage: usage.rows }); }));
  return { store, worker, providers };
}

export function completionGuard({ requiredItems = [], verification = [], changed = false }) {
  const unfinished = requiredItems.filter((i) => i.required !== false && i.status !== "completed" && i.status !== "skipped");
  const failedVerification = verification.filter((v) => v.required !== false && v.status !== "passed");
  return { complete: changed && unfinished.length === 0 && failedVerification.length === 0, unfinished, failedVerification, reason: !changed ? "No requested change was recorded" : unfinished.length ? "Required task items remain" : failedVerification.length ? "Verification is incomplete" : null };
}

export async function recoverStaleRuns(pool, staleMs = 120_000) {
  const rows = await pool.query(`UPDATE coding_agent_runs SET status='queued',phase='recovery',lock_token=NULL,updated_at=NOW(),metadata=metadata||'{"recovered":true}'::jsonb WHERE status='running' AND COALESCE(heartbeat_at,started_at,created_at) < NOW()-($1::text||' milliseconds')::interval RETURNING id`, [staleMs]);
  for (const row of rows.rows) await new RuntimeStore(pool).emit(row.id, "run.recovered", { reason: "stale_heartbeat" });
  return rows.rowCount;
}
