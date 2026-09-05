import test from "node:test"
import assert from "node:assert/strict"
import { applyTodoOperation, assertTargetBinding, compactSpecialistResult, createHandoff, createRunContext, evolveRunContext, HandoffLoopGuard, OrchestratorCore, renderTodoMarkdown, routeFailure, routeRequest, selectContext } from "../orchestrator/index.mjs"

test("RunContext preserves immutable request and enforces target binding", () => {
  const context = createRunContext({ runId: "r1", originalRequest: "deploy app", target: { targetId: "t1", projectId: "p1", password: "no" } })
  assert.equal(context.target.password, undefined)
  assert.throws(() => evolveRunContext(context, { originalRequest: "replace" }), /immutable/)
  assert.equal(evolveRunContext(context, { project: { root: "/srv/app" } }).identity.originalRequest, "deploy app")
  assert.throws(() => assertTargetBinding(context, { runId: "r1", targetId: "wrong", projectId: "p1" }), /TARGET_BINDING_MISMATCH/)
})

test("semantic TODO operations deduplicate and render authoritative model view", () => {
  let result = applyTodoOperation([], { type: "ADD_TASK", task: { key: "Provision Database", title: "Provision DB", owner: "database" } })
  result = applyTodoOperation(result.todo, { type: "ADD_TASK", task: { key: "provision-database", title: "Duplicate" } })
  assert.equal(result.todo.length, 1)
  result = applyTodoOperation(result.todo, { type: "COMPLETE_TASK", taskKey: "provision_database" })
  const context = evolveRunContext(createRunContext({ originalRequest: "Deploy" }), { todo: result.todo })
  assert.match(renderTodoMarkdown(context), /\[x\] database · Provision DB/)
})

test("deterministic routing loads only relevant specialists", () => {
  assert.deepEqual(routeRequest("Pull latest changes and restart this project", { serverId: "8" }).agents, ["orchestrator", "vps", "github", "deployment", "testing"])
  const frontend = routeRequest("The site has no CSS")
  assert(frontend.agents.includes("frontend"))
  assert(!frontend.agents.includes("database"))
  assert.equal(routeFailure("DATABASE_URL_REQUIRED"), "database")
})

test("handoffs are structured and unchanged-state retries are bounded", () => {
  const guard = new HandoffLoopGuard({ maxAttempts: 2 })
  const state = { revision: 4, error: "missing env" }
  assert.equal(guard.record({ taskKey: "build", agent: "deployment", failureCode: "ENV", state }).allowed, true)
  assert.equal(guard.record({ taskKey: "build", agent: "deployment", failureCode: "ENV", state }).allowed, true)
  assert.equal(guard.record({ taskKey: "build", agent: "deployment", failureCode: "ENV", state }).reason, "UNCHANGED_STATE_LOOP")
  assert.equal(createHandoff({ taskKey: "build", agent: "deployment", expectedOutcome: "built" }).attempt, 1)
})

test("context selection is minimal and redacts credential values", () => {
  const context = { project: { root: "/srv/app", apiToken: "abc" }, target: { serverId: "8" }, conversation: { huge: true } }
  assert.deepEqual(selectContext(context, ["project", "target.serverId"]), { project: { root: "/srv/app", apiToken: "[secure reference]" }, target: { serverId: "8" } })
  assert.equal(compactSpecialistResult({ status: "failed", summary: "x", findings: [{ password: "oops" }] }).findings[0].password, "[secure reference]")
})

test("OrchestratorCore coordinates handoff results without exposing full context", () => {
  const engine = new OrchestratorCore()
  let { context } = engine.initialize({ runId: "r2", originalRequest: "Deploy repository to server", target: { serverId: "8", targetId: "t8", projectId: "p8" } })
  context = evolveRunContext(context, { todo: [{ key: "clone_repository", title: "Clone", owner: "github", status: "in_progress" }], project: { repository: "owner/repo", secret: "hidden" } })
  const planned = engine.planHandoff(context, context.todo[0], { contextRefs: ["identity.runId", "target.serverId", "project.repository"] })
  assert.deepEqual(Object.keys(planned.specialistContext), ["identity", "target", "project"])
  const applied = engine.applyResult(context, planned.handoff, {
    status: "completed",
    summary: "Repository cloned",
    todoOperations: [{ type: "COMPLETE_TASK", taskKey: "clone_repository" }],
    findings: ["branch main"],
  })
  assert.equal(applied.context.todo[0].status, "completed")
  assert.equal(engine.determineRunStatus(applied.context), "COMPLETED")
  assert.equal(applied.context.identity.originalRequest, "Deploy repository to server")
})

test("orchestrator stores a requested domain in deployment context, not SSH identity", () => {
  const engine = new OrchestratorCore()
  const { context } = engine.initialize({ originalRequest: "Deploy to app.example.com", target: { host: "169.58.3.73", sshPort: 22, username: "root" } })
  assert.equal(context.target.host, "169.58.3.73")
  assert.equal(context.target.username, "root")
  assert.equal(context.deployment.domain, "app.example.com")
  assert.equal(context.target.domain, undefined)
})
