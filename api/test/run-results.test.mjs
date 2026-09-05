import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { normalizeProjectRoot } from "../agent-task-identity.mjs"
import { canonicalRunResult, conciseRunTitle, deriveAcceptanceCriteria, professionalFinalReport, requestSpecificTodo } from "../run-results-runtime.mjs"
import { loadRegistrySelection } from "../agent-engine/v1/registry.mjs"

const callingRequest = "Inspect and fix the Planète Libia production audio and video calling system, then verify both directions with TURN"

test("calling runs receive request-specific acceptance criteria and TODO ownership", () => {
  const criteria = deriveAcceptanceCriteria(callingRequest)
  const todo = requestSpecificTodo(callingRequest)
  assert.equal(criteria.length, 14)
  assert.equal(todo.length, criteria.length)
  assert.equal(todo[0].status, "in_progress")
  assert.ok(criteria.some(item => item.key === "turn_relay" && item.owner === "infrastructure"))
  assert.ok(criteria.some(item => item.key === "audio_b_to_a" && item.owner === "testing"))
})

test("calling specialist routing loads realtime skills without unrelated github work", () => {
  const selected = loadRegistrySelection({ request: callingRequest, context: {}, todo: requestSpecificTodo(callingRequest) })
  assert.ok(selected.agents.some(item => item.id === "realtime"))
  for (const skill of ["webrtc", "socketio", "turn", "prisma"]) assert.ok(selected.skills.some(item => item.id === skill))
  assert.ok(!selected.skills.some(item => item.id === "github"))
})

test("canonical completion fails at zero evidence and becomes verified only with complete evidence", () => {
  const acceptance = deriveAcceptanceCriteria(callingRequest)
  const partial = canonicalRunResult({ requestedStatus: "completed", acceptance, todo: [], summary: "done" })
  assert.equal(partial.status, "FAILED")
  assert.equal(partial.complete, false)
  const passed = acceptance.map(item => ({ ...item, status: "passed", evidence: ["browser test artifact"] }))
  assert.equal(canonicalRunResult({ requestedStatus: "completed", acceptance: passed, todo: [] }).status, "VERIFIED")
})

test("project root remains stable while a Prisma file is current", () => {
  assert.equal(normalizeProjectRoot("opened /var/www/planete-libia-ai/prisma/schema.prisma", "planete-libia-ai"), "/var/www/planete-libia-ai")
})

test("professional final report is concise and derives its status", () => {
  const result = canonicalRunResult({ requestedStatus: "completed", acceptance: deriveAcceptanceCriteria(callingRequest), todo: [] })
  const report = professionalFinalReport({ result, title: conciseRunTitle(callingRequest, "Planète Libia"), summary: "STATUS: VERIFIED\nChecked the implementation.", durationMs: 65000, usage: { totalTokens: 1234, creditsUsed: 25 } })
  assert.match(report, /^FAILED/)
  assert.doesNotMatch(report, /STATUS: VERIFIED|REQUEST:/)
  assert.ok(report.length < 1800)
})

test("runtime does not force read-only inspection into verified completion", async () => {
  const source = await readFile(new URL("../index.mjs", import.meta.url), "utf8")
  assert.doesNotMatch(source, /This means task already done/i)
  assert.doesNotMatch(source, /if \(task\.status === "running"\) task\.status = "completed"/)
  assert.match(source, /AND \$4=false THEN 'completed'/)
})
