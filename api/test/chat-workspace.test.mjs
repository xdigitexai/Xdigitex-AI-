import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspace = await readFile(new URL("../../frontend/public/chat-workspace.js", import.meta.url), "utf8");
const html = await readFile(new URL("../../frontend/public/index.html", import.meta.url), "utf8");

test("canonical chat URL boots the persistent workspace", () => {
  assert.match(workspace, /\/servers\\\/\(\\d\+\)\\\/chats/);
  assert.match(workspace, /conversations\/\$\{conversationId\}/);
  assert.match(html, /chat-workspace\.js/);
});

test("workspace supports history, new chat, follow-up, and lazy activity", () => {
  assert.match(workspace, /Search conversations/);
  assert.match(workspace, /\+ New Chat/);
  assert.match(workspace, /messages: \[\{ role: "user", content \}\]/);
  assert.match(workspace, /\/activity/);
});
