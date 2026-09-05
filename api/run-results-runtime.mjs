const calling = /\b(audio|video|webrtc|calling|call system|turn relay|stun|ice candidate|socket\.io)\b/i
const ssl = /\b(?:install|issue|renew|configure|fix|enable)\b.{0,30}\b(?:ssl|tls|https|certificate|certbot|let'?s encrypt|autossl)\b|\b(?:ssl|tls|https|certificate|certbot|let'?s encrypt|autossl)\b.{0,30}\b(?:install|issue|renew|configure|fix|enable)\b/i

export function isSslRequest(request) { return ssl.test(String(request || "")) }

export function detectRunType(request) {
  const text = String(request || "")
  const parts = []
  if (/\b(inspect|check|review|diagnos|test|verify)\b/i.test(text)) parts.push("inspection")
  if (/\b(fix|change|implement|build|create|update)\b/i.test(text)) parts.push("implementation")
  if (/\b(deploy|publish|production)\b/i.test(text)) parts.push("deployment")
  if (/\b(test|verify|prove|real|browser)\b/i.test(text)) parts.push("verification")
  return parts.length > 1 ? "hybrid" : parts[0] || "inspection"
}

export function deriveAcceptanceCriteria(request) {
  if (isSslRequest(request)) return [
    ["dns_binding", "Domain resolves to the expected server", "ssl"], ["vhost_identified", "Correct vhost and document root identified", "infrastructure"],
    ["acme_reachable", "ACME challenge path is publicly reachable", "ssl"], ["certificate_issued", "Certificate issued", "ssl"],
    ["certificate_bound", "Certificate installed and bound to the requested hostname", "ssl"], ["hostname_match", "Certificate SAN covers the requested hostname", "testing"],
    ["https_handshake", "HTTPS handshake and certificate chain succeed", "testing"], ["no_mismatch", "SNI serves no certificate mismatch", "testing"],
    ["public_https", "Public HTTPS verification passes without insecure mode", "testing"], ["renewal", "Certificate renewal mechanism verified", "ssl"],
  ].map(([key, title, owner]) => ({ key, title, owner, status: "not_tested", evidence: [], required: true }))
  if (calling.test(String(request || ""))) return [
    ["calling_architecture", "Calling architecture detected", "realtime"], ["signaling_backend", "Signaling backend inspected", "backend"],
    ["webrtc_frontend", "Frontend WebRTC lifecycle inspected", "frontend"], ["call_persistence", "Call persistence inspected", "database"],
    ["incoming_call", "Incoming call tested", "testing"], ["audio_a_to_b", "Audio A → B verified", "testing"],
    ["audio_b_to_a", "Audio B → A verified", "testing"], ["video_a_to_b", "Video A → B verified", "testing"],
    ["video_b_to_a", "Video B → A verified", "testing"], ["call_states", "Decline, cancel, missed and busy states tested", "testing"],
    ["call_history", "Call history verified", "database"], ["turn_relay", "TURN relay verified", "infrastructure"],
    ["mobile_call_ui", "Mobile call UI verified", "frontend"], ["production_quality", "Production call quality verified", "testing"],
  ].map(([key, title, owner]) => ({ key, title, owner, status: "not_tested", evidence: [] }))
  const text = String(request || "").trim().replace(/\s+/g, " ")
  return [{ key: "requested_outcome", title: text.slice(0, 240) || "Requested outcome", owner: "orchestrator", status: "not_tested", evidence: [] }]
}

export function requestSpecificTodo(request, target = {}) {
  const criteria = deriveAcceptanceCriteria(request)
  if (isSslRequest(request)) return criteria.map((item, index) => ({ key: item.key, title: item.title, owner: item.owner, status: index === 0 ? "in_progress" : "pending", source: "ssl_acceptance" }))
  if (calling.test(String(request || ""))) return criteria.map((item, index) => ({ key: item.key, title: item.title.replace(/ verified| tested/i, match => match), owner: item.owner, status: index === 0 ? "in_progress" : "pending", source: "acceptance_criterion" }))
  return []
}

export function normalizeEvidence(value) {
  const evidence = Array.isArray(value) ? value : value ? [value] : []
  return evidence.map(item => typeof item === "string" ? item : JSON.stringify(item)).filter(item => item.length > 3).slice(0, 50)
}

export function canonicalRunResult({ requestedStatus, acceptance = [], todo = [], filesChanged = [], unresolved = [], summary = "" }) {
  if (["cancelled", "blocked", "failed"].includes(requestedStatus)) return { status: requestedStatus.toUpperCase(), complete: false }
  const required = acceptance.filter(item => item.required !== false), passed = required.filter(item => item.status === "passed" && normalizeEvidence(item.evidence).length), failed = required.filter(item => item.status === "failed"), notTested = required.filter(item => !["passed", "failed"].includes(item.status) || item.status === "passed" && !normalizeEvidence(item.evidence).length)
  const unfinished = todo.filter(item => !["completed", "skipped"].includes(item.status))
  const hasChanges = filesChanged.length > 0, inspectionOnly = !hasChanges && /inspect|review|search|read|diagnos/i.test(summary)
  if (!failed.length && !notTested.length && !unfinished.length && !unresolved.length) return { status: "VERIFIED", complete: true, passed: passed.length, total: required.length, inspectionOnly }
  return { status: failed.length ? "PARTIALLY_VERIFIED" : "PARTIALLY_VERIFIED", complete: false, passed: passed.length, total: required.length, notTested: notTested.map(x => x.key), failed: failed.map(x => x.key), unfinished: unfinished.map(x => x.key), inspectionOnly }
}

export function conciseRunTitle(request, projectName) {
  if (isSslRequest(request)) { const domain=String(request).match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0]; return `${domain || projectName || "Domain"} — SSL` }
  if (calling.test(String(request || ""))) return `${projectName || "Project"} — Calling System`
  const clean = String(request || "Task").replace(/https?:\/\/\S+/g, "").replace(/[#*_`]/g, "").replace(/\s+/g, " ").trim()
  return clean.split(" ").slice(0, 8).join(" ") || "Server task"
}

export function professionalFinalReport({ result, title, summary, filesChanged = [], durationMs = 0, usage = {} }) {
  const seconds = Math.floor(durationMs / 1000), time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
  const tokens = Number(usage.totalTokens || 0), tokenText = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : String(tokens)
  return [result.status.replaceAll("_", " "), "", title, "", String(summary || "Run finished.").replace(/^\s*STATUS\s*:[^\n]*\n?/im, "").slice(0, 1200), "", `Changes: ${filesChanged.length ? `${filesChanged.length} file${filesChanged.length === 1 ? "" : "s"}` : "No files modified"}`, `Acceptance: ${result.passed || 0} / ${result.total || 0} verified`, `Time: ${time}`, `Tokens: ${tokenText}`, `Credits used: ${Number(usage.creditsUsed || 0).toLocaleString("en-US")}`, `Cost: $${Number(usage.costUsd || 0).toFixed(4)}`].join("\n")
}
