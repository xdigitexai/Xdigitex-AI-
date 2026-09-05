import assert from "node:assert/strict"
import test from "node:test"
import { classifyStartupFailure, createStartupTrace, validateExecutableTodo } from "../run-startup-runtime.mjs"
import { loadRegistrySelection, registryManifest } from "../agent-engine/v1/registry.mjs"

test("SSL regression creates executable TODO independently from acceptance", async () => {
  const { requestSpecificTodo, deriveAcceptanceCriteria } = await import("../run-results-runtime.mjs")
  const request = "install ssl for ogzensmm.online", todo = requestSpecificTodo(request), acceptance = deriveAcceptanceCriteria(request)
  const checked = validateExecutableTodo(todo, registryManifest().agents)
  assert.equal(checked.valid, true)
  assert.ok(checked.todo.length > 0)
  assert.ok(acceptance.length > 0)
  assert.notDeepEqual(checked.todo.map(item => item.title), acceptance.map(item => item.title))
  assert.equal(checked.todo[0].status, "in_progress")
})

test("domain-only infrastructure startup permits a null project root", () => {
  const selection = loadRegistrySelection({ request: "check nginx status", context: { target: { type: "vps" }, project: { projectRoot: null } } })
  assert.ok(selection.agents.some(item => item.id === "infrastructure"))
  assert.ok(Array.isArray(selection.warnings))
})

test("missing owner and dependencies fall back without crashing", () => {
  const checked = validateExecutableTodo([{ semanticKey: "ssl.inspect", title: "Inspect", owner: "missing", dependencies: ["absent"] }], ["infrastructure"])
  assert.equal(checked.todo[0].owner, "orchestrator")
  assert.deepEqual(checked.todo[0].dependencies, [])
})

test("startup trace and typed failure preserve the last safe stage", () => {
  const trace = createStartupTrace(() => "now"); trace.mark("todo.create"); trace.mark("skills.resolve")
  const failure = classifyStartupFailure(new ReferenceError("formatTargetLockBlock is not defined"), trace.last().stage)
  assert.equal(failure.stage, "skills.resolve")
  assert.equal(failure.code, "SKILL_RESOLVER_INIT_FAILED")
  assert.equal(failure.retryable, false)
})
