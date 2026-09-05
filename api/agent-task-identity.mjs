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
  return candidates.map((candidate) => {
    if (projectName) { const marker = `/${projectName}`, at = candidate.toLowerCase().indexOf(marker.toLowerCase()), end = at + marker.length; if (at >= 0 && (candidate.length === end || candidate[end] === "/")) return candidate.slice(0, end); }
    if (projectName) return null;
    if (/(?:^|\/)(?:node_modules|dist|build|\.next)(?:\/|$)/i.test(candidate)) return null;
    const parts = candidate.split("/");
    if (candidate.startsWith("/var/www/") && parts.length >= 4) return parts.slice(0, 4).join("/");
    if (candidate.startsWith("/opt/") && parts.length >= 3) return parts.slice(0, 3).join("/");
    const fileAt = parts.findIndex((part, index) => index > 2 && (/\.[a-z0-9]{1,12}$/i.test(part) || ["Dockerfile", "Makefile", "Procfile"].includes(part)));
    return fileAt > 0 ? parts.slice(0, fileAt).join("/") : candidate;
  }).find((candidate) => candidate && !/(?:^|\/)(?:node_modules|dist|build|\.next)(?:\/|$)/i.test(candidate)) ?? null;
}
