import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(new URL("../../frontend/public/chat-workspace.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../frontend/public/index.html", import.meta.url), "utf8");

test("canonical chat URL boots the persistent workspace", () => {
  assert.match(workspace, /\/servers\\\/\(\\d\+\)\\\/chats/);
  assert.match(workspace, /conversations\/\$\{cid\}/);
  assert.match(html, /chat-workspace\.js/);
});

test("workspace supports history, new chat, follow-up, and inline persisted activity", () => {
  assert.match(workspace, /Chat history/);
  assert.match(workspace, /\+ New Chat/);
  assert.match(workspace, /messages:\[\{role:"user",content:text\}\]/);
  assert.match(workspace, /runs\/\$\{r\.run_id\}\/events/);
  assert.match(workspace, /Command output/);
  assert.doesNotMatch(workspace, /View activity/);
  assert.match(workspace, /trigger_message_id/);
  assert.match(workspace, /PATH\\s\+\[ABC\]/);
  assert.doesNotMatch(workspace, /completed · completed/);
});

test("server cards route reliably and execution logs scroll independently", () => {
  assert.match(workspace, /body\.items\|\|body\.servers\|\|body\.data/);
  assert.match(workspace, /\/servers\/\$\{server\.id\}\/conversations/);
  assert.match(workspace, /max-height:min\(400px,48vh\)/);
  assert.match(workspace, /max-height:45vh/);
  assert.match(workspace, /New activity ↓/);
  assert.match(workspace, /CSS\.escape\(runId\)/);
  assert.match(workspace, /replace\(\/\\uFFFD\/g/);
  assert.match(workspace, /Conversation creation failed/);
  assert.match(workspace, /conversation\.canonicalUrl/);
});

test("execution details and long prompts are compact by default", () => {
  assert.match(workspace, /Show technical details/);
  assert.match(workspace, /Command output/);
  assert.match(workspace, /Show full prompt/);
  assert.match(workspace, /content\.length>2000/);
  assert.match(workspace, /Open as \.txt/);
  assert.match(workspace, /task\.created/);
  assert.match(workspace, /cmd_results\|credits_used\|tokens/);
});
