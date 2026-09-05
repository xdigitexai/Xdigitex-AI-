import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const workspace = await readFile(new URL("../../frontend/public/chat-workspace-codex.js", import.meta.url), "utf8")
const html = await readFile(new URL("../../frontend/public/index.html", import.meta.url), "utf8")
const runCardSource = workspace.slice(workspace.indexOf("function runCard"), workspace.indexOf("function queuedMessages"))

test("canonical persistent chat URL boots the Codex-style workspace", () => {
  assert.match(workspace, /\/servers\\\/\(\\d\+\)\\\/chats/)
  assert.match(workspace, /conversations\/\$\{conversationId\}/)
  assert.match(html, /chat-workspace-codex\.js/)
})

test("workspace is conversation-first with three distinct panes", () => {
  for (const marker of ["sidebar", "messages", "context-panel", "composer", "context-tabs"]) assert.match(workspace, new RegExp(marker))
  for (const tab of ["overview", "tasks", "files", "changes", "queue", "activity"]) assert.match(workspace, new RegExp(`"${tab}"`))
  assert.match(workspace, /context-hidden/)
  assert.doesNotMatch(workspace, /Show technical details/)
})

test("main run card stays compact and structured state drives status", () => {
  assert.match(workspace, /function runCard\(run\)/)
  assert.match(workspace, /result\.status\|\|run\.status/)
  assert.match(workspace, /checks verified/)
  assert.match(workspace, /data-stop/)
  assert.doesNotMatch(runCardSource, /REQUEST:/)
  assert.doesNotMatch(workspace, /function eventView/)
})

test("long prompts, attachments, and queued messages remain conversational", () => {
  assert.match(workspace, /lines\.slice\(0,12\)/)
  assert.match(workspace, /Show full/)
  assert.match(workspace, /Open as text/)
  assert.match(workspace, /function queuedMessages/)
  assert.match(workspace, /Queue":"Send/)
  assert.match(workspace, /data-qedit/)
})

test("attachment records and pending selections are deduplicated", () => {
  assert.match(workspace, /function dedupeAttachments/)
  assert.match(workspace, /seen\.has\(key\)/)
  assert.match(workspace, /lastModified===file\.lastModified/)
  assert.match(workspace, /attachment-chip/)
  assert.match(workspace, /previewAttachment/)
  assert.match(workspace, /ondragover/)
  assert.match(workspace, /clipboardData\.items/)
})

test("activity is grouped, bounded, and isolated from main run cards", () => {
  assert.match(workspace, /function groupedActivity/)
  assert.match(workspace, /slice\(-80\)/)
  assert.match(workspace, /activity-group/)
  assert.doesNotMatch(runCardSource, /activity-group|cmd_output|Command output/)
})

test("desktop and mobile layouts keep composer and panels usable", () => {
  assert.match(workspace, /grid-template-columns:240px minmax\(460px,1fr\) 330px/)
  assert.match(workspace, /@media\(max-width:720px\)/)
  assert.match(workspace, /position:fixed;inset:0 18% 0 0/)
  assert.match(workspace, /pending-chip\{max-width:100%/)
  assert.match(workspace, /!event\.shiftKey/)
})
