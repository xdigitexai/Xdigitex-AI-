const clone = value => structuredClone(value)

const cleanString = value => typeof value === "string" && value.trim() ? value.trim() : undefined

export function createRunContext(input = {}) {
  const originalRequest = cleanString(input.originalRequest)
  if (!originalRequest) throw new TypeError("originalRequest is required")
  const identity = Object.freeze({
    runId: cleanString(input.runId),
    conversationId: cleanString(input.conversationId),
    userId: cleanString(input.userId),
    originalRequest,
    acceptanceCriteria: Object.freeze([...(input.acceptanceCriteria || [])].map(String)),
  })
  return Object.freeze({
    identity,
    target: Object.freeze(sanitizeTarget(input.target || {})),
    project: Object.freeze(clone(input.project || {})),
    deployment: Object.freeze(clone(input.deployment || {})),
    database: Object.freeze(clone(input.database || {})),
    todo: Object.freeze([]),
    findings: Object.freeze([]),
    filesChanged: Object.freeze([]),
    unresolved: Object.freeze([]),
    currentTask: null,
    revision: 0,
  })
}

export function sanitizeTarget(target) {
  const allowed = ["type", "targetId", "serverId", "projectId", "desktopId", "host", "sshPort", "username"]
  return Object.fromEntries(allowed.flatMap(key => target[key] == null ? [] : [[key, clone(target[key])]]))
}

export function evolveRunContext(context, updates = {}) {
  if (!context?.identity) throw new TypeError("invalid RunContext")
  if (updates.identity || updates.originalRequest || updates.acceptanceCriteria) {
    throw new TypeError("run identity and original request are immutable")
  }
  const next = { ...context, ...clone(updates), identity: context.identity, revision: context.revision + 1 }
  if (updates.target) next.target = Object.freeze({ ...context.target, ...sanitizeTarget(updates.target) })
  for (const key of ["project", "deployment", "database"]) {
    if (updates[key]) next[key] = Object.freeze({ ...context[key], ...clone(updates[key]) })
  }
  for (const key of ["todo", "findings", "filesChanged", "unresolved"]) {
    next[key] = Object.freeze([...(next[key] || [])].map(clone))
  }
  return Object.freeze(next)
}

export function assertTargetBinding(context, binding) {
  for (const key of ["runId", "targetId", "projectId"]) {
    const expected = key === "runId" ? context.identity.runId : context.target[key]
    if (expected != null && binding?.[key] !== expected) throw new Error(`TARGET_BINDING_MISMATCH:${key}`)
  }
  return true
}
