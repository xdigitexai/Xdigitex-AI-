import test from "node:test";
import assert from "node:assert/strict";
import { ReasoningRecoveryState, buildCompactReasoningState, buildReplanCheckpoint } from "../reasoning-recovery.mjs";

test("identical-action exhaustion requests a model replan instead of terminal failure", () => {
  const state = new ReasoningRecoveryState();
  state.recordFailure({ strategy: "certbot", actions: ["certbot --apache -d example.com"], evidence: "plugin unavailable" });
  const second = state.recordFailure({ strategy: "certbot", actions: ["certbot --apache -d example.com"], evidence: "plugin unavailable" });
  assert.equal(second.strategyExhausted, true);
  const prompt = buildReplanCheckpoint({ objective: "fix ssl", failure: "plugin unavailable", state, availableTools: ["detect_hosting_environment"] });
  assert.match(prompt, /does NOT end the run/); assert.match(prompt, /materially different/); assert.match(prompt, /certbot/);
});

test("a different strategy has an independent local retry budget", () => {
  const state = new ReasoningRecoveryState();
  state.recordFailure({ strategy: "certbot", actions: ["certbot -d example.com"], evidence: "no privilege" });
  state.recordFailure({ strategy: "certbot", actions: ["certbot -d example.com"], evidence: "no privilege" });
  const alternative = state.recordFailure({ strategy: "cpanel_autossl", actions: ["uapi SSL start_autossl_check"], evidence: "queued" });
  assert.equal(alternative.attempt, 1); assert.equal(alternative.strategyExhausted, false);
});

test("compaction preserves failed strategies, findings, todo, and acceptance", () => {
  const state = new ReasoningRecoveryState(); state.recordFinding("cPanel detected; account is unprivileged"); state.recordFailure({ strategy: "certbot", actions: ["certbot"], evidence: "command unavailable" });
  const compact = buildCompactReasoningState({ objective: "fix ssl", state, todo: ["Inspect AutoSSL"], acceptance: ["SAN matches hostname"] });
  assert.match(compact, /cPanel detected/); assert.match(compact, /certbot/); assert.match(compact, /Inspect AutoSSL/); assert.match(compact, /SAN matches hostname/);
});
