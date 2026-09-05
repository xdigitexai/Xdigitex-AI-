import { compactSpecialistResult, selectContext } from "./compaction.mjs"
import { createRunContext, evolveRunContext } from "./context.mjs"
import { HandoffLoopGuard, stateHash } from "./loop-guard.mjs"
import { createHandoff, createSpecialistResult } from "./protocol.mjs"
import { routeFailure, routeRequest } from "./routing.mjs"
import { applyTodoOperations } from "./todo.mjs"

export class OrchestratorCore {
  #guard
  constructor({ maxUnchangedAttempts = 3 } = {}) {
    this.#guard = new HandoffLoopGuard({ maxAttempts: maxUnchangedAttempts })
  }

  initialize(input) {
    const route = routeRequest(input.originalRequest, input.target)
    const { domain, ...target } = route.target
    return { context: createRunContext({ ...input, target, deployment: { ...(input.deployment || {}), ...(domain && { domain }) } }), route }
  }

  planHandoff(context, task, { agent, contextRefs = [], expectedOutcome, reasonCode } = {}) {
    const owner = agent || task.owner || "orchestrator"
    return {
      handoff: createHandoff({
        taskKey: task.key,
        agent: owner,
        contextRefs,
        expectedOutcome: expectedOutcome || `${task.key}_completed`,
        stateHash: stateHash({ revision: context.revision, task, selected: selectContext(context, contextRefs) }),
        reasonCode,
      }),
      specialistContext: selectContext(context, contextRefs),
    }
  }

  applyResult(context, handoff, rawResult) {
    const result = createSpecialistResult(rawResult)
    const todo = applyTodoOperations(context.todo, result.todoOperations)
    const contextUpdates = { ...result.contextUpdates }
    delete contextUpdates.identity
    delete contextUpdates.originalRequest
    delete contextUpdates.acceptanceCriteria
    const findings = [...context.findings, ...result.findings]
    const filesChanged = [...context.filesChanged, ...result.changes]
    const unresolved = result.blockingIssue ? [...context.unresolved, result.blockingIssue] : context.unresolved
    const next = evolveRunContext(context, { ...contextUpdates, todo, findings, filesChanged, unresolved, currentTask: null })
    return { context: next, result: compactSpecialistResult(result) }
  }

  classifyFailure(context, handoff, failureCode, failureState) {
    const retry = this.#guard.record({ taskKey: handoff.taskKey, agent: handoff.agent, failureCode, state: failureState })
    return {
      ...retry,
      nextAgent: retry.allowed ? routeFailure(failureCode) : null,
      disposition: retry.allowed ? "handoff" : "blocked",
      decisionSummary: retry.allowed
        ? `Route ${handoff.taskKey} after ${failureCode} to ${routeFailure(failureCode)}`
        : `Block ${handoff.taskKey}: unchanged state repeated`,
    }
  }

  determineRunStatus(context) {
    if (context.todo.some(item => item.status === "blocked")) return "BLOCKED"
    if (context.todo.some(item => item.status === "in_progress" || item.status === "pending")) return "PARTIAL"
    if (context.unresolved.length) return "PARTIAL"
    if (context.todo.length && context.todo.every(item => item.status === "completed" || item.status === "skipped")) return "COMPLETED"
    return "PARTIAL"
  }
}
