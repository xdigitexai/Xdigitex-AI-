import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"
import { inspectZip, routeAttachment } from "../attachments-runtime.mjs"
import { classifyInstruction, instructionTasks } from "../instruction-queue-runtime.mjs"

function centralEntry(name, expanded = 12, mode = 0) {
  const n = Buffer.from(name), b = Buffer.alloc(46 + n.length)
  b.writeUInt32LE(0x02014b50, 0); b.writeUInt32LE(expanded, 24); b.writeUInt16LE(n.length, 28); b.writeUInt32LE((mode << 16) >>> 0, 38); n.copy(b, 46)
  return b
}

test("ZIP manifests are inspected lazily and identify project files", () => {
  const manifest = inspectZip(Buffer.concat([centralEntry("hotel-app/package.json"), centralEntry("hotel-app/src/app.ts")]))
  assert.equal(manifest.fileCount, 2)
  assert.deepEqual(manifest.topLevel, ["hotel-app"])
  assert.deepEqual(manifest.manifests, ["hotel-app/package.json"])
})

test("ZIP traversal, absolute paths, symlinks and bombs are rejected", () => {
  assert.throws(() => inspectZip(centralEntry("../escape.js")), /Unsafe ZIP path/)
  assert.throws(() => inspectZip(centralEntry("/root/file")), /Unsafe ZIP path/)
  assert.throws(() => inspectZip(centralEntry("link", 1, 0xa000)), /symlinks/)
  assert.throws(() => inspectZip(centralEntry("huge.bin", 300 * 1024 * 1024)), /allowed size/)
})

test("attachments route only to relevant specialists", () => {
  assert.deepEqual(routeAttachment({ name: "schema.sql" }), ["database"])
  assert.deepEqual(routeAttachment({ name: "mobile.png", mimeType: "image/png" }), ["frontend", "testing"])
  assert.deepEqual(routeAttachment({ name: "Dockerfile" }), ["deployment"])
})

test("queue classifier separates constraints, followups and target changes", () => {
  assert.equal(classifyInstruction("Do not modify nginx").classification, "INTERRUPT_CURRENT_RUN")
  assert.equal(classifyInstruction("Push it to GitHub when done").classification, "APPEND_CURRENT_RUN")
  assert.equal(classifyInstruction("Deploy a different project to another server").classification, "NEXT_RUN")
  assert.equal(classifyInstruction("Make the button green").classification, "MERGE_CURRENT_RUN")
})

test("queued GitHub instruction creates owned executable TODO tasks", () => {
  const tasks = instructionTasks("Push everything to GitHub when done", { targetType: "vps" })
  assert.deepEqual(tasks.map(x => x.owner), ["github", "github", "github"])
  assert.equal(new Set(tasks.map(x => x.key)).size, 3)
  assert.ok(tasks.every(x => x.source === "queued_instruction"))
})

test("live chat keeps composer enabled and sends attachment references", () => {
  const ui = fs.readFileSync(new URL("../../frontend/public/chat-workspace.js", import.meta.url), "utf8")
  const runtime = fs.readFileSync(new URL("../index.mjs", import.meta.url), "utf8")
  assert.match(ui, /ondrop=/); assert.match(ui, /addEventListener\("paste"/); assert.match(ui, /attachmentIds/)
  assert.doesNotMatch(ui, /Agent is working….*disabled/)
  assert.match(runtime, /reviewSafeBoundary/); assert.match(runtime, /chat_attachments SET message_id/)
})
