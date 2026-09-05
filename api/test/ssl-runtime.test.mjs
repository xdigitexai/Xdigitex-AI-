import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import { canonicalRunResult, deriveAcceptanceCriteria, requestSpecificTodo } from "../run-results-runtime.mjs"
import { compactSslResults, sslCommandIsValidFinalProof, sslEvidenceFromResults, sslRecoveryFromResults } from "../ssl-runtime.mjs"
import { selectSpecialists, selectSkills } from "../agent-engine/v1/registry.mjs"

const request = "install ssl for ogzensmm.online"

test("SSL tasks use goal-specific acceptance and TODO state", () => {
  const acceptance = deriveAcceptanceCriteria(request), todo = requestSpecificTodo(request)
  assert.equal(acceptance.length, 10)
  assert.equal(todo.length, 8)
  assert.notDeepEqual(todo.map(item => item.key), acceptance.map(item => item.key))
  assert.equal(todo[0].status, "in_progress")
  assert.deepEqual(acceptance.map(item => item.key), ["dns_binding", "vhost_identified", "acme_reachable", "certificate_issued", "certificate_bound", "hostname_match", "https_handshake", "no_mismatch", "public_https", "renewal"])
  assert.ok(acceptance.every(item => item.required))
})

test("simple SSL routing excludes GitHub, coding, frontend, and database", () => {
  const agents = selectSpecialists({ request, context: { target: { type: "vps" } }, todo: requestSpecificTodo(request) })
  assert.ok(agents.includes("ssl") && agents.includes("infrastructure") && agents.includes("testing"))
  for (const unrelated of ["github", "coding", "frontend", "database", "deployment"]) assert.ok(!agents.includes(unrelated))
  assert.ok(selectSkills({ request }, agents).includes("ssl"))
})

test("SSH authentication and failed Certbot never satisfy SSL acceptance", () => {
  const results = ["$ ssh wrapper\nauthenticated\n[SUCCESS; exit 0]", "$ certbot certonly\nunauthorized: challenge returned 404\n[COMMAND_FAILURE; exit 1]"]
  assert.deepEqual(sslEvidenceFromResults(results, "ogzensmm.online"), [])
  const outcome = canonicalRunResult({ requestedStatus: "completed", acceptance: deriveAcceptanceCriteria(request), todo: [] })
  assert.equal(outcome.status, "FAILED")
  assert.equal(outcome.complete, false)
})

test("ACME 404 creates deterministic recoverable work", () => {
  const recovery = sslRecoveryFromResults(["unauthorized: http://ogzensmm.online/.well-known/acme-challenge/a returned 404"], "ogzensmm.online")
  assert.equal(recovery.recoverable, true)
  assert.deepEqual(recovery.tasks, ["Diagnose ACME challenge path", "Verify active document root", "Verify public HTTP challenge routing"])
  assert.equal(recovery.stateHash, sslRecoveryFromResults(["unauthorized: returned 404"], "ogzensmm.online").stateHash)
})

test("normal TLS proof is accepted but insecure curl is never final proof", () => {
  assert.equal(sslCommandIsValidFinalProof("openssl s_client -connect ogzensmm.online:443 -servername ogzensmm.online"), true)
  assert.equal(sslCommandIsValidFinalProof("curl -k https://ogzensmm.online"), false)
  assert.equal(sslCommandIsValidFinalProof("curl --insecure https://ogzensmm.online"), false)
})

test("SSL command output is compacted before returning to the model", () => {
  const raw = `$ certbot certonly\n${Array.from({ length: 200 }, (_, i) => `noise ${i}`).join("\n")}\nunauthorized challenge returned 404\n[COMMAND_FAILURE; exit 1]`
  const compact = compactSslResults([raw])
  assert.ok(compact.length < 1800)
  assert.match(compact, /unauthorized challenge returned 404/)
  assert.doesNotMatch(compact, /noise 100/)
})

test("runtime applies SSL evidence rather than sequential command completion", async () => {
  const source = await readFile(new URL("../index.mjs", import.meta.url), "utf8")
  assert.match(source, /if \(task\.isSslTask\) await applySslRunEvidence/)
  assert.match(source, /\[SSL COMPLETION GATE\]/)
  assert.match(source, /lastSslIssueMutationEpoch === mutationEpoch/)
  assert.match(source, /task\.isSslTask \? 32/)
  assert.match(source, /task\.isSslTask \? 16/)
  assert.match(source, /simpleTaskFastPath \|\| task\.isSslTask \? Promise\.resolve/)
  assert.match(source, /task\.isSslTask \? \[\{ role: "user", content: userTaskText\.slice/)
  assert.match(source, /SSL EFFICIENCY WARNING/)
  assert.match(source, /compactSslResults\(cmdResults\)/)
})
