import { domainToASCII } from "node:url";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export function normalizeDomain(value) {
  const domain = domainToASCII(String(value ?? "").trim().toLowerCase().replace(/\.$/, ""));
  if (!domain || domain.length > 253 || !domain.includes(".") || !/^[a-z0-9.-]+$/.test(domain) || domain.split(".").some((x) => !x || x.length > 63 || x.startsWith("-") || x.endsWith("-"))) throw new Error("Invalid fully-qualified domain");
  return domain;
}

export function parseInfrastructureRequest(text) {
  const source = String(text ?? "");
  const pathMatch = source.match(/(?:^|\s)(\/(?:var|srv|home|opt|www)\/[^\s,;]+)/i);
  const domainCandidates = [...source.matchAll(/\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}\.?\b/gi)].map((m) => normalizeDomain(m[0]));
  const explicitPort = source.match(/\bport\s+(\d{2,5})\b/i);
  return {
    action: /\bdeploy|connect|subdomain|reverse proxy\b/i.test(source) ? "deployment" : "general",
    projectPath: pathMatch ? path.posix.normalize(pathMatch[1]) : null,
    domain: domainCandidates.at(-1) ?? null,
    portStrategy: /\bfree port|unused port|available port\b/i.test(source) ? "AUTO_FREE_PORT" : explicitPort ? "EXPLICIT" : null,
    requestedPort: explicitPort ? Number(explicitPort[1]) : null,
    constraints: {
      preserveExistingServices: /do not affect|don't affect|preserve existing|without affecting/i.test(source),
      mustVerifySsl: /\bssl|https\b/i.test(source),
      forbiddenPorts: [...source.matchAll(/(?:do not|don't|never)\s+use\s+(\d{2,5})/gi)].map((m) => Number(m[1])),
    },
  };
}

export function occupiedPortsFromSs(output) {
  const ports = new Set();
  for (const line of String(output).split(/\r?\n/)) {
    const address = line.match(/(?:\]|:)(\d{1,5})(?:\s|$)/g) ?? [];
    for (const token of address) { const n = Number(token.match(/\d+/)?.[0]); if (n > 0 && n <= 65535) ports.add(n); }
  }
  return ports;
}

export function selectFreePort(occupied, { min = 49152, max = 60999, forbidden = [], seed = 0 } = {}) {
  const used = occupied instanceof Set ? occupied : new Set(occupied);
  const blocked = new Set(forbidden);
  const span = max - min + 1;
  for (let i = 0; i < span; i++) { const candidate = min + ((seed + i) % span); if (!used.has(candidate) && !blocked.has(candidate)) return candidate; }
  throw new Error("No free port is available in the configured range");
}

export function assertExactDeploymentTarget(expected, actual) {
  if (String(expected.serverId) !== String(actual.serverId)) throw new Error("Server identity mismatch");
  if (path.posix.normalize(expected.projectPath) !== path.posix.normalize(actual.projectPath)) throw new Error("Project path mismatch");
  if (normalizeDomain(expected.domain) !== normalizeDomain(actual.domain)) throw new Error("Domain identity mismatch");
  if (Number(expected.port) !== Number(actual.port)) throw new Error("Port identity mismatch");
  return true;
}

export class LoopDetector {
  constructor({ maxIdentical = 3, stuckAfter = 5 } = {}) { this.maxIdentical = maxIdentical; this.stuckAfter = stuckAfter; this.records = []; }
  fingerprint(action) { return createHash("sha256").update(JSON.stringify({ tool: action.tool, input: action.input, error: action.error, target: action.target })).digest("hex"); }
  record(action, progress = {}) { const fingerprint = this.fingerprint(action); const meaningful = Boolean(progress.newInformation || progress.fileChanged || progress.errorChanged || progress.todoCompleted || progress.testImproved || progress.deploymentChanged); this.records.push({ fingerprint, meaningful }); const identical = this.records.filter((x) => x.fingerprint === fingerprint).length; const recent = this.records.slice(-this.stuckAfter); return { fingerprint, identical, meaningful, retryAllowed: identical < this.maxIdentical, strategyChangeRequired: identical >= this.maxIdentical || (recent.length >= this.stuckAfter && recent.every((x) => !x.meaningful)), stuck: recent.length >= this.stuckAfter && recent.every((x) => !x.meaningful) }; }
}

export class DeploymentRegistry {
  constructor(pool) { this.pool = pool; }
  async createTarget({ userId, projectId, serverId, projectPath, domain, portMode = "AUTO_FREE_PORT", allowExistingDomainOverwrite = false, constraints = {} }) {
    const normalized = normalizeDomain(domain), absolute = path.posix.normalize(projectPath);
    if (!absolute.startsWith("/")) throw new Error("Deployment project path must be absolute");
    const existing = await this.pool.query("SELECT * FROM deployment_registry WHERE server_id=$1 AND domain=$2 AND status='active'", [serverId, normalized]);
    if (existing.rowCount && !allowExistingDomainOverwrite) throw new Error("Requested domain belongs to an existing deployment");
    const row = await this.pool.query(`INSERT INTO deployment_contexts(public_id,user_id,project_id,server_id,requested_domain,working_directory,port_mode,allow_existing_domain_overwrite,constraints,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'validated') RETURNING *`, [randomUUID(), userId, projectId, serverId, normalized, absolute, portMode, allowExistingDomainOverwrite, JSON.stringify(constraints)]);
    return row.rows[0];
  }
  async reservePort(contextId, port) { return (await this.pool.query(`UPDATE deployment_contexts SET selected_port=$2,updated_at=NOW() WHERE id=$1 AND selected_port IS NULL AND NOT EXISTS(SELECT 1 FROM deployment_registry d WHERE d.server_id=deployment_contexts.server_id AND d.port=$2 AND d.status='active') RETURNING *`, [contextId, port])).rows[0] ?? null; }
}

export const deploymentMigrations = [
`CREATE TABLE IF NOT EXISTS deployment_contexts (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), project_id INTEGER REFERENCES projects(id), server_id INTEGER NOT NULL REFERENCES servers(id), requested_domain TEXT NOT NULL, working_directory TEXT NOT NULL, port_mode TEXT NOT NULL, selected_port INTEGER, allow_existing_domain_overwrite BOOLEAN NOT NULL DEFAULT FALSE, constraints JSONB NOT NULL DEFAULT '{}', previous_configuration JSONB, status TEXT NOT NULL DEFAULT 'draft', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(server_id,requested_domain))`,
`CREATE TABLE IF NOT EXISTS deployment_registry (id BIGSERIAL PRIMARY KEY, public_id TEXT UNIQUE NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), project_id INTEGER REFERENCES projects(id), server_id INTEGER NOT NULL REFERENCES servers(id), deployment_context_id BIGINT REFERENCES deployment_contexts(id), domain TEXT NOT NULL, port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535), process_name TEXT NOT NULL, working_directory TEXT NOT NULL, runtime TEXT, status TEXT NOT NULL, metadata JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
`CREATE UNIQUE INDEX IF NOT EXISTS deployment_registry_active_domain_uidx ON deployment_registry(server_id,domain) WHERE status='active'`,
`CREATE UNIQUE INDEX IF NOT EXISTS deployment_registry_active_port_uidx ON deployment_registry(server_id,port) WHERE status='active'`,
`CREATE TABLE IF NOT EXISTS agent_run_iterations (id BIGSERIAL PRIMARY KEY, run_id BIGINT NOT NULL REFERENCES coding_agent_runs(id) ON DELETE CASCADE, iteration INTEGER NOT NULL, fingerprint TEXT NOT NULL, progress JSONB NOT NULL DEFAULT '{}', strategy TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(run_id,iteration))`,
];
