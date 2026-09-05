import test from "node:test"; import assert from "node:assert/strict";
import { classifyTaskRuntimeFailure } from "../run-task-state.mjs";
test("first-task failure is impossible after a tool starts", () => { const failure = classifyTaskRuntimeFailure(Object.assign(new Error("duplicate key"), { code: "23505" }), { startupStage: "task.start", firstToolStartedAt: new Date(), phase: "running" }); assert.equal(failure.stage, "running"); assert.notEqual(failure.code, "FIRST_TASK_START_FAILED"); });
test("genuine pre-execution task start failure keeps its precise code", () => { const failure = classifyTaskRuntimeFailure(new Error("write failed"), { startupStage: "task.start", firstToolStartedAt: null, phase: "initializing_tasks" }); assert.equal(failure.code, "FIRST_TASK_START_FAILED"); });
