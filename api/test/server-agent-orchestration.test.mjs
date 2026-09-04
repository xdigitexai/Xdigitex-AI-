import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../index.mjs", import.meta.url), "utf8");

test("non-streaming planner does not reference an undeclared transport stream", () => {
  assert.doesNotMatch(source, /activeStream\s*=\s*stream\s*;/);
  assert.match(source, /const completion = await callWithRetry\(\)/);
});

test("server agent applies bounded cycle and command budgets", () => {
  assert.match(source, /const maxIterations = taskComplexity/);
  assert.match(source, /const maxCommands = taskComplexity/);
  assert.match(source, /No-progress loop detected/);
});

test("runtime failures log correlated stack details but return a safe message", () => {
  assert.match(source, /\[server-agent-runtime\]/);
  assert.match(source, /stack: err instanceof Error \? err\.stack/);
  assert.match(source, /return "Internal agent runtime error\."/);
});
