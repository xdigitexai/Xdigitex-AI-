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
  assert.match(workspace, /Show output/);
  assert.doesNotMatch(workspace, /View activity/);
  assert.match(workspace, /trigger_message_id/);
  assert.match(workspace, /PATH\\s\+\[ABC\]/);
  assert.doesNotMatch(workspace, /completed · completed/);
});
