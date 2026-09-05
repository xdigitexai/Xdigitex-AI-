import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REGISTRY_VERSION = "1.0.0";
const root = path.dirname(fileURLToPath(import.meta.url));

const definitions = {
  orchestrator: { file: "orchestrator.md", skills: [] },
  coding: { file: "coding.md", skills: ["debugging"] },
  github: { file: "github.md", skills: ["git"] },
  deployment: { file: "deployment.md", skills: [] },
  database: { file: "database.md", skills: [] },
  frontend: { file: "frontend.md", skills: [] },
  backend: { file: "backend.md", skills: [] },
  infrastructure: { file: "infrastructure.md", skills: [] },
  testing: { file: "testing.md", skills: [] },
  debugging: { file: "debugging.md", skills: ["debugging"] },
  realtime: { file: "realtime.md", skills: ["webrtc", "socketio", "turn", "prisma"] },
  ssl: { file: "ssl.md", skills: ["ssl", "dns"] },
  vps: { file: "adapters/vps.md", skills: ["vps", "ssh"] },
  cpanel: { file: "adapters/cpanel.md", skills: ["cpanel"] },
  local: { file: "adapters/local.md", skills: [] },
};

const skillFiles = {
  git: "../../skills/coding/git.md", debugging: "../../skills/coding/debugging.md",
  node: "../../skills/coding/node.md", react: "../../skills/web/react.md",
  postgres: "../../skills/database/postgres.md", mysql: "../../skills/database/mysql.md",
  docker: "../../skills/devops/docker.md", nginx: "../../skills/devops/nginx.md",
  vps: "../../skills/devops/vps.md", ssh: "../../skills/devops/ssh.md",
  cpanel: "../../skills/devops/cpanel.md", website: "../../skills/verification/website.md",
  api: "../../skills/verification/api.md", pnpm: "skills/pnpm.md", npm: "skills/npm.md",
  pm2: "skills/pm2.md", systemd: "skills/systemd.md", express: "skills/express.md", webrtc: "skills/webrtc.md", socketio: "skills/socketio.md", turn: "skills/turn.md", prisma: "skills/prisma.md",
  ssl: "skills/ssl/SKILL.md", dns: "skills/dns/SKILL.md",
};

const skillMetadata = {
  ssl: { description: "Issue, bind and verify hostname-valid TLS certificates", activationHints: ["ssl", "tls", "https", "certificate", "certbot", "acme"] },
  dns: { description: "Resolve and validate domain records against an owned target", activationHints: ["dns", "domain", "a record", "aaaa", "cname"] },
};

const textOf = (input) => [input.request, input.context?.currentTask, ...(input.todo || []).map(t => `${t.key || ""} ${t.title || ""}`), ...(input.context?.findings || [])].join(" ").toLowerCase();
const has = (text, pattern) => pattern.test(text);
const add = (set, ...values) => values.forEach(value => set.add(value));

export function selectSpecialists(input = {}) {
  const text = textOf(input);
  const agents = new Set(["orchestrator"]);
  const target = input.context?.target?.type || "";
  const sslOnly = /\b(?:ssl|tls|https|certificate|certbot|let'?s encrypt|autossl|acme)\b/.test(text) && !/\b(?:git|github|commit|push|application code|frontend|database)\b/.test(text);
  const git = has(text, /\b(git|github|repository|repo|clone|pull|push|commit|branch|checkout|fetch|merge|rebase)\b/);
  const deploy = has(text, /\b(deploy|deployment|publish|production|restart|pm2|systemd|nginx|apache|ssl|domain|vhost)\b/);
  const frontend = has(text, /\b(frontend|react|vue|svelte|css|stylesheet|browser|ui|asset|vite|next(?:js)?|unstyled)\b/);
  const database = has(text, /\b(database|postgres(?:ql)?|mysql|mariadb|sqlite|mongodb|redis|migration|orm|prisma|drizzle|orders? (?:not|isn't|aren't) sav)\b/);
  const backend = has(text, /\b(backend|api|endpoint|express|server route|healthz?|cron|worker|queue)\b/);
  const debug = has(text, /\b(fix|bug|error|fail|broken|debug|not working|stuck|missing|404|500|502)\b/);
  const coding = has(text, /\b(build|implement|create|code|refactor|feature|function|class|file)\b/) || (debug && !deploy);
  const realtime = has(text, /\b(webrtc|audio call|video call|calling|signaling|socket\.io|stun|turn|ice candidate|media track|rtcstats)\b/);

  if (sslOnly) add(agents, "ssl", "infrastructure", "testing");
  else if (deploy) add(agents, "deployment", "testing");
  if (git) add(agents, "github");
  if (frontend) add(agents, "frontend");
  if (database) add(agents, "database");
  if (backend) add(agents, "backend");
  if (debug) add(agents, "debugging");
  if (coding && !sslOnly) add(agents, "coding");
  if (realtime) add(agents, "realtime", "frontend", "backend", "testing");
  if (deploy && has(text, /\b(nginx|apache|ssl|tls|certbot|proxy|pm2|systemd|docker|domain|vhost)\b/)) add(agents, "infrastructure");
  if (target === "cpanel" || has(text, /\bcpanel\b/)) add(agents, "cpanel");
  else if (target === "local" || has(text, /\b(localhost|desktop bridge|local machine)\b/)) add(agents, "local");
  else if (deploy || target === "vps") add(agents, "vps");
  return [...agents];
}

export function selectSkills(input = {}, agents = selectSpecialists(input)) {
  const text = textOf(input);
  const skills = new Set(agents.flatMap(id => definitions[id]?.skills || []));
  const detected = input.context?.project || {};
  const evidence = `${text} ${detected.runtime || ""} ${detected.packageManager || ""} ${detected.stack || ""}`.toLowerCase();
  if (/\bpnpm\b/.test(evidence)) skills.add("pnpm");
  if (/\bnpm\b/.test(evidence) && !/\bpnpm\b/.test(evidence)) skills.add("npm");
  if (/\bnode(?:js)?\b/.test(evidence)) skills.add("node");
  if (/\breact\b/.test(evidence)) skills.add("react");
  if (/\bexpress\b/.test(evidence)) skills.add("express");
  if (/\bpostgres(?:ql)?\b/.test(evidence)) skills.add("postgres");
  if (/\bmysql|mariadb\b/.test(evidence)) skills.add("mysql");
  if (/\bdocker|compose\b/.test(evidence)) skills.add("docker");
  if (/\bnginx\b/.test(evidence)) skills.add("nginx");
  if (/\bpm2\b/.test(evidence)) skills.add("pm2");
  if (/\bwebrtc|rtcpeerconnection|mediastream|getusermedia|rtcstats\b/.test(evidence)) skills.add("webrtc");
  if (/\bsocket\.io|signaling|offer|answer|ice candidate\b/.test(evidence)) skills.add("socketio");
  if (/\bstun|turn|coturn|relay candidate\b/.test(evidence)) skills.add("turn");
  if (/\bprisma|schema\.prisma\b/.test(evidence)) skills.add("prisma");
  if (/\bsystemd|systemctl\b/.test(evidence)) skills.add("systemd");
  if (agents.includes("frontend") && agents.includes("testing")) skills.add("website");
  if (agents.includes("backend") && agents.includes("testing")) skills.add("api");
  return [...skills];
}

export function loadRegistrySelection(input = {}) {
  const warnings = [];
  const readOptional = (file, kind, id) => { try { return fs.readFileSync(file, "utf8") } catch (error) { warnings.push({ code: `${kind.toUpperCase()}_UNAVAILABLE`, id, message: error.code || "READ_FAILED" }); return "" } };
  const agentIds = selectSpecialists(input).filter(id => { if (definitions[id]) return true; warnings.push({ code: "SPECIALIST_UNAVAILABLE", id }); return false });
  const skillIds = selectSkills(input, agentIds);
  return {
    version: REGISTRY_VERSION,
    agents: agentIds.map(id => ({ id, version: REGISTRY_VERSION, document: readOptional(path.join(root, "specialists", definitions[id].file), "specialist", id) })).filter(item => item.document),
    skills: skillIds.filter(id => { if (skillFiles[id]) return true; warnings.push({ code: "SKILL_UNAVAILABLE", id }); return false }).map(id => ({ id, version: REGISTRY_VERSION, description: skillMetadata[id]?.description || `${id} operational guidance`, activationHints: skillMetadata[id]?.activationHints || [id], path: skillFiles[id], document: readOptional(path.resolve(root, skillFiles[id]), "skill", id) })).filter(item => item.document),
    warnings,
  };
}

export function registryManifest() {
  return { version: REGISTRY_VERSION, agents: Object.keys(definitions), skills: Object.keys(skillFiles) };
}
