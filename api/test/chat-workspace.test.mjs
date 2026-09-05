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

test("workspace is a two-column conversation with inline work", () => {
  for (const marker of ["sidebar", "messages", "composer", "inline-block", "inline-activity"]) assert.match(workspace, new RegExp(marker))
  assert.match(workspace, /grid-template-columns:250px minmax\(0,1fr\)/)
  assert.match(workspace, /\.context-panel\{display:none!important\}/)
  assert.doesNotMatch(workspace.slice(workspace.indexOf("function renderShell"), workspace.indexOf("function refresh")), /context-panel|context-tabs|View work|Hide work|data-panel="files"/)
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

test("semantic activity is bounded and technical details are inline", () => {
  assert.match(workspace, /function groupedActivity/)
  assert.match(workspace, /slice\(-40\)/)
  assert.match(workspace, /View details/)
  assert.doesNotMatch(runCardSource, /payload\.command|payload\.cmd|cmd_output/)
})

test("desktop and mobile layouts keep one chat surface and composer usable", () => {
  assert.match(workspace, /grid-template-columns:250px minmax\(0,1fr\)/)
  assert.match(workspace, /@media\(max-width:720px\)/)
  assert.match(workspace, /width:min\(88vw,360px\)/)
  assert.match(workspace, /env\(safe-area-inset-bottom\)/)
  assert.match(workspace, /pending-chip\{max-width:100%/)
  assert.match(workspace, /!event\.shiftKey/)
})

test("drawer closes synchronously and chat switching is SPA cached", () => {
  assert.match(workspace, /function closeDrawer/)
  assert.match(workspace, /closeDrawer\(\);stopPolling\(\);conversationId=id/)
  assert.match(workspace, /history\.pushState/)
  assert.match(workspace, /state\.cache\.get\(id\)/)
  assert.match(workspace, /chat-skeleton/)
  assert.match(workspace, /data-close-drawer/)
  assert.doesNotMatch(workspace.slice(workspace.indexOf("async function switchChat")), /location\.assign/)
})

test("new chat is optimistic and does not persist until first send", () => {
  const source=workspace.slice(workspace.indexOf("function createChat"),workspace.indexOf("async function ensureConversation"))
  assert.match(source,/conversationId=null/)
  assert.match(source,/closeDrawer\(\)/)
  assert.doesNotMatch(source,/request\(/)
  assert.match(workspace,/await ensureConversation\(\)/)
})
