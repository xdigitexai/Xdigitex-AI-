const stageCodes = {
  "skills.resolve": "SKILL_RESOLVER_INIT_FAILED",
  "specialists.resolve": "SPECIALIST_RESOLVER_INIT_FAILED",
  "billing.check": "BILLING_RESERVATION_FAILED",
  "provider.select": "PROVIDER_INITIALIZATION_FAILED",
  "provider.request": "PROVIDER_REQUEST_FAILED",
  "scheduler.ready": "SCHEDULER_INITIALIZATION_FAILED",
  "task.start": "FIRST_TASK_START_FAILED",
}

export function createStartupTrace(now = () => new Date().toISOString()) {
  const entries = []
  return { entries, mark(stage, details = {}) { const entry = { stage, at: now(), ...details }; entries.push(entry); return entry }, last() { return entries.at(-1) || null } }
}

export function classifyStartupFailure(error, stage = "run.create") {
  const raw = String(error?.message || error || "Unknown startup failure")
  const provider = /api key|model|provider|openai|authentication|401|429/i.test(raw)
  const billing = /credit|billing|balance/i.test(raw)
  const resolvedStage = billing ? "billing.check" : provider ? "provider.select" : stage
  return { code: stageCodes[resolvedStage] || "AGENT_STARTUP_FAILED", stage: resolvedStage, message: raw.slice(0, 500), recoverable: /timeout|network|fetch|module|registry|scheduler/i.test(raw), retryable: /timeout|network|fetch|module|registry|scheduler/i.test(raw), source: error?.stack?.match(/\(([^)]+)\)/)?.[1] || null }
}

export function validateExecutableTodo(todo = [], knownSpecialists = []) {
  if (!todo.length) return { valid: false, code: "NO_EXECUTABLE_TASKS", fallbackOwner: "orchestrator" }
  const known = new Set(["orchestrator", ...knownSpecialists])
  const keys = new Set(todo.map(item => item.key || item.semanticKey).filter(Boolean))
  const normalized = todo.map((item, index) => ({ ...item, key: item.key || item.semanticKey || `task.${index + 1}`, owner: known.has(item.owner) ? item.owner : "orchestrator", dependencies: (item.dependencies || []).filter(key => keys.has(key)) }))
  return { valid: true, todo: normalized }
}
