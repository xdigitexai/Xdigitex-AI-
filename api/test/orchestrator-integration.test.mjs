import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

const source = fs.readFileSync(new URL("../index.mjs", import.meta.url), "utf8")

test("streaming server agent initializes one shared orchestrator context", () => {
  assert.match(source, /new OrchestratorCore\(\)/)
  assert.match(source, /task\.orchestration = \{ orchestrator, context, selection \}/)
  assert.match(source, /renderTodoMarkdown\(context\)/)
})

test("active prompt uses selected registry content instead of the legacy broad loader", () => {
  assert.match(source, /loadRegistrySelection\(\{ request: promptText, context, todo: context\.todo \}\)/)
  assert.match(source, /block: specialistPromptBlock\(task\)/)
  const active = source.slice(source.indexOf("void (async () =>"), source.indexOf("const aiMessages ="))
  assert.doesNotMatch(active, /xd_runSkillEngine\(userTaskText/)
})

test("runtime discovery refreshes specialist and skill selection", () => {
  assert.match(source, /refreshOrchestrationSelection\(task, task\.orchestration\?\.context\?\.identity\?\.originalRequest/)
  assert.match(source, /specialists_loaded/)
  assert.match(source, /activeSpecialist/)
})
