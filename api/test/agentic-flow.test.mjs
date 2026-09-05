import assert from "node:assert/strict"
import test from "node:test"
import { BASE_AGENT_POLICY, ResourceLockManager, SpecialistScheduler, instructionHierarchy, mergeSpecialistResults } from "../orchestrator/index.mjs"
import { loadRegistrySelection } from "../agent-engine/v1/registry.mjs"

test("base policy encodes initiative, hierarchy, proportional testing, and authoritative completion", () => {
  assert.match(BASE_AGENT_POLICY, /Bias toward action/)
  assert.match(BASE_AGENT_POLICY, /Do not stop after acknowledgement/)
  assert.match(BASE_AGENT_POLICY, /proportionate verification/)
  assert.match(BASE_AGENT_POLICY, /authoritative TODO, acceptance evidence/)
  assert.deepEqual(instructionHierarchy({ currentRequest: "fix it" }).map(item => item.source), ["platform", "user", "conversation", "repository", "specialist", "skill"])
})

test("scheduler bounds concurrency, depth, credits, dependencies, and conflicting writes", async () => {
  const locks = new ResourceLockManager(), scheduler = new SpecialistScheduler({ maxParallel: 2, maxDepth: 2, locks })
  const tasks = [
    { id: "a", semanticKey: "inspect.a", owner: "backend", status: "pending", resources: ["file:/app/package.json"], estimatedCredits: 2 },
    { id: "b", semanticKey: "inspect.b", owner: "frontend", status: "pending", resources: ["file:/app/package.json"], estimatedCredits: 2 },
    { id: "c", semanticKey: "inspect.c", owner: "database", status: "pending", resources: ["database:app"], estimatedCredits: 9 },
  ]
  const plan = scheduler.plan(tasks, { availableCredits: 4 })
  assert.equal(plan[0].runnable, true)
  assert.match(plan[1].reason, /^LOCKED:/)
  assert.equal(plan[2].reason, "CREDIT_RESERVATION")
})

test("result merger deduplicates evidence and aggregates specialist usage", () => {
  const merged = mergeSpecialistResults([{ findings: ["same"], changes: ["a.js"], usage: { inputTokens: 10, credits: 1 } }, { findings: ["same"], verification: ["pass"], usage: { inputTokens: 5, credits: 2 } }])
  assert.deepEqual(merged.findings, ["same"])
  assert.equal(merged.usage.inputTokens, 15)
  assert.equal(merged.usage.credits, 3)
})

test("SSL selection uses folder skills and loads only relevant domain guidance", () => {
  const selected = loadRegistrySelection({ request: "install ssl for example.com", context: { target: { type: "vps" } } })
  assert.deepEqual(selected.skills.filter(item => ["ssl", "dns"].includes(item.id)).map(item => item.id), ["ssl", "dns"])
  assert.ok(selected.skills.every(item => item.path && item.description && item.activationHints.length))
  assert.match(selected.skills.find(item => item.id === "ssl").document, /# Failure Recovery/)
})
