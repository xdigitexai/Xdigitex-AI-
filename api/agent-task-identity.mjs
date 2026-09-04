const OBJECTIVES = [
  ["connect_server", /connect|authenticate|ssh/], ["inspect_deployment", /(?:inspect|check|review).*(?:deployment|domain|server state)/],
  ["inspect_repo", /(?:inspect|detect|review).*(?:repo|runtime|stack)/], ["install_dependencies", /install.*depend|dependency install/],
  ["build_app", /build|compile/], ["detect_database", /(?:inspect|detect|determine).*(?:database|\bdb\b)|database requirement/],
  ["provision_database", /provision|create.*database/], ["configure_database_url", /database_url|configure.*database/],
  ["run_migrations", /migration/], ["start_app", /start|restart.*(?:app|application|process)/],
  ["configure_reverse_proxy", /nginx|apache|reverse proxy|vhost/], ["verify_origin", /verify.*origin|port ownership/],
  ["verify_frontend", /verify.*(?:frontend|website|production)/], ["verify_api", /verify.*api/], ["verify_tls", /verify.*tls|ssl/]
];

export function semanticTaskKey(title, context = {}) {
  const value = String(title || "").toLowerCase();
  const objective = OBJECTIVES.find(([, pattern]) => pattern.test(value))?.[0] ?? value.replace(/\b(the|a|an|application|production|safe|isolated|current)\b/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return `${objective}:server=${context.serverId ?? "unknown"}:project=${context.projectName ?? "unknown"}`;
}

export function normalizeProjectRoot(output, projectName = "") {
  const candidates = [...String(output || "").matchAll(/(?:^|[\s=:"'])(\/(?:var\/www|home|opt)\/[\w./-]+)/gm)].map((match) => match[1].replace(/[,:;]+$/, ""));
  return candidates.map((candidate) => projectName && candidate.includes(`/${projectName}/`) ? candidate.slice(0, candidate.indexOf(`/${projectName}/`) + projectName.length + 1) : candidate).find((candidate) => !/(?:^|\/)(?:node_modules|dist|build|\.next)(?:\/|$)|\.(?:c?js|mjs|ts|py|php)$/i.test(candidate)) ?? null;
}
