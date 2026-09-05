const patterns = {
  github: /\b(git|github|clone|pull|push|commit|branch|repository|repo)\b/i,
  deployment: /\b(deploy|restart|release|production|publish|start app)\b/i,
  coding: /\b(build|implement|create|code|feature|fix)\b/i,
  debugging: /\b(bug|broken|error|fail|stuck|debug|not working)\b/i,
  database: /\b(database|postgres|mysql|mariadb|sqlite|mongo|redis|migration|orders? (?:are )?not saving)\b/i,
  frontend: /\b(frontend|css|unstyled|layout|react|vue|svelte|browser|page|website)\b/i,
  backend: /\b(api|backend|endpoint|server route|health check)\b/i,
  infrastructure: /\b(nginx|apache|ssl|tls|certificate|pm2|systemd|docker|proxy)\b/i,
  testing: /\b(test|verify|acceptance|typecheck)\b/i,
}

export function detectTarget(request, hints = {}) {
  const text = String(request || "")
  const domain = text.match(/\b(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:\/|\b)/i)?.[1]
  const host = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/)?.[0]
  const local = /\b(localhost|127\.0\.0\.1|local machine|desktop bridge)\b/i.test(text)
  const cpanel = /\bcpanel\b/i.test(text) || hints.type === "cpanel"
  return {
    type: local ? "local" : cpanel ? "cpanel" : host || hints.serverId ? "vps" : hints.type || "unresolved",
    ...(hints.targetId && { targetId: hints.targetId }),
    ...(hints.serverId && { serverId: hints.serverId }),
    ...(hints.projectId && { projectId: hints.projectId }),
    ...((host || hints.host) && { host: host || hints.host }),
    ...(domain && { domain }),
    ...(hints.sshPort && { sshPort: hints.sshPort }),
    ...(hints.username && { username: hints.username }),
    ...(hints.desktopId && { desktopId: hints.desktopId }),
  }
}

export function routeRequest(request, hints = {}) {
  const text = String(request || "")
  const intents = Object.entries(patterns).filter(([, pattern]) => pattern.test(text)).map(([id]) => id)
  const target = detectTarget(text, hints)
  const agents = new Set(["orchestrator"])
  if (target.type !== "unresolved") agents.add(target.type)
  for (const intent of intents) agents.add(intent)
  if (intents.includes("deployment")) agents.add("testing")
  return { intents, target, agents: [...agents], reasonCodes: intents.map(value => `INTENT_${value.toUpperCase()}`) }
}

export function routeFailure(failureCode = "") {
  const code = String(failureCode).toUpperCase()
  if (/DATABASE|MIGRATION|SQL/.test(code)) return "database"
  if (/GIT|REPOSITORY|PUSH|CLONE/.test(code)) return "github"
  if (/CSS|ASSET|FRONTEND|HYDRATION/.test(code)) return "frontend"
  if (/NGINX|TLS|SSL|PROXY|PORT|SERVICE/.test(code)) return "infrastructure"
  if (/TEST|ASSERT|VERIFY/.test(code)) return "testing"
  return "debugging"
}
