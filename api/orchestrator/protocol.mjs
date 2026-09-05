const RESULT_STATUSES = new Set(["completed", "partial", "blocked", "failed", "no_action_required"])

export function createHandoff(input) {
  for (const key of ["taskKey", "agent", "expectedOutcome"]) if (!input?.[key]) throw new TypeError(`${key} is required`)
  return Object.freeze({
    taskKey: String(input.taskKey),
    agent: String(input.agent),
    contextRefs: Object.freeze([...(input.contextRefs || [])].map(String)),
    expectedOutcome: String(input.expectedOutcome),
    attempt: Number(input.attempt || 1),
    stateHash: String(input.stateHash || ""),
    reasonCode: String(input.reasonCode || "TASK_OWNER_SELECTED"),
  })
}

export function createSpecialistResult(input) {
  if (!RESULT_STATUSES.has(input?.status)) throw new TypeError("invalid specialist result status")
  return Object.freeze({
    status: input.status,
    summary: String(input.summary || ""),
    findings: Object.freeze([...(input.findings || [])]),
    changes: Object.freeze([...(input.changes || [])]),
    todoOperations: Object.freeze([...(input.todoOperations || [])]),
    contextUpdates: Object.freeze({ ...(input.contextUpdates || {}) }),
    verification: Object.freeze([...(input.verification || [])]),
    blockingIssue: input.blockingIssue ? Object.freeze({ ...input.blockingIssue }) : null,
    usage: Object.freeze({ model: input.usage?.model, inputTokens: input.usage?.inputTokens || 0, outputTokens: input.usage?.outputTokens || 0, durationMs: input.usage?.durationMs || 0 }),
  })
}
