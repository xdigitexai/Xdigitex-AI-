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

test("simple known-file work uses the fast path and skips generic knowledge", () => {
  assert.match(source, /const simpleTaskFastPath =/);
  assert.match(source, /Inspect this exact source file first/);
  assert.match(source, /simpleTaskFastPath \? Promise\.resolve\(\[\]\)/);
  assert.match(source, /taskComplexity === "simple" \? 1 : 3/);
});

test("shell exit semantics do not turn grep no-match into repair failure", () => {
  assert.match(source, /commandName === "grep" && result\.code === 1 \? "NO_MATCH"/);
  assert.match(source, /commandName === "grep" && result\.code === 2 \? "TOOL_SYNTAX_ERROR"/);
  assert.match(source, /toolClassification === "COMMAND_FAILURE"/);
});

test("read-only command results are cached until a successful mutation", () => {
  assert.match(source, /const commandResultCache/);
  assert.match(source, /commandResultCache\.has\(cacheKey\)/);
  assert.match(source, /mutationEpoch\+\+/);
});
