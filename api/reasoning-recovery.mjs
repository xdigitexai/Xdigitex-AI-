import { createHash } from "node:crypto";

const normalize = (value = "") => String(value).replace(/\s+/g, " ").trim().toLowerCase();

export class ReasoningRecoveryState {
  constructor(snapshot = {}) {
    this.failedStrategies = new Map(Object.entries(snapshot.failedStrategies || {}));
    this.actionAttempts = new Map(Object.entries(snapshot.actionAttempts || {}));
    this.currentHypothesis = snapshot.currentHypothesis || null;
    this.findings = Array.isArray(snapshot.findings) ? snapshot.findings.slice(-20) : [];
  }
  recordFailure({ strategy = "unspecified", actions = [], evidence = "", acceptance = [] }) {
    const signature = createHash("sha256").update(actions.map(normalize).sort().join("|")).digest("hex").slice(0, 16);
    const attempt = Number(this.actionAttempts.get(signature) || 0) + 1;
    this.actionAttempts.set(signature, attempt);
    const prior = this.failedStrategies.get(strategy) || { attempts: 0, evidence: [] };
    this.failedStrategies.set(strategy, { attempts: prior.attempts + 1, evidence: [...prior.evidence, String(evidence).slice(-5000)].slice(-3), acceptance: [...new Set([...(prior.acceptance || []), ...acceptance])] });
    return { signature, attempt, sameActionRetryRemaining: Math.max(0, 2 - attempt), strategyExhausted: attempt >= 2 };
  }
  recordFinding(finding) { const value = String(finding || "").trim(); if (value && !this.findings.includes(value)) this.findings.push(value.slice(0, 1500)); this.findings = this.findings.slice(-20); }
  toJSON() { return { currentHypothesis: this.currentHypothesis, findings: this.findings, failedStrategies: Object.fromEntries(this.failedStrategies), actionAttempts: Object.fromEntries(this.actionAttempts) }; }
}

export function buildReplanCheckpoint({ objective, failure, state, remainingAcceptance = [], availableTools = [] }) {
  const exhausted = [...state.failedStrategies.entries()].map(([name, detail]) => `- ${name}: ${detail.attempts} failed attempt(s); ${detail.evidence.at(-1) || "no evidence"}`).join("\n") || "- none";
  return `[MODEL REASONING CHECKPOINT — STRATEGY REPLAN]\nOriginal objective: ${String(objective).slice(0, 1500)}\n\nThe last action strategy is exhausted. This limits repetition of that action; it does NOT end the run.\n\nFailure evidence:\n${String(failure).slice(-6000)}\n\nFailed approaches (do not repeat without changed evidence):\n${exhausted}\n\nKnown findings:\n${state.findings.map((x) => `- ${x}`).join("\n") || "- none recorded"}\n\nRemaining acceptance criteria:\n${remainingAcceptance.map((x) => `- ${x}`).join("\n") || "- re-read the original objective and gather proof"}\n\nAvailable tools:\n${availableTools.join(", ") || "run_remote_command, detect_hosting_environment"}\n\nReason about why the strategy failed. Choose a materially different reasonable strategy when one is authorized. Update the TODO to reflect the new plan, then execute the smallest useful next action. Only return blocked/failed when all reasonable authorized strategies are exhausted, and include the exact external blocker and required user action. Do not declare success without acceptance evidence.`;
}

export function buildCompactReasoningState({ objective, state, todo = [], acceptance = [] }) {
  return `[COMPACT RUN CONTEXT — CONTINUE THE SAME TASK]\nGoal: ${String(objective).slice(0, 1500)}\nCurrent hypothesis: ${state.currentHypothesis || "Re-evaluate from preserved evidence"}\nKnown environment/findings:\n${state.findings.map((x) => `- ${x}`).join("\n") || "- none recorded"}\nFailed approaches and why:\n${[...state.failedStrategies.entries()].map(([name, detail]) => `- ${name}: ${detail.evidence.at(-1) || "failed"}`).join("\n") || "- none"}\nCurrent TODO:\n${todo.map((x) => `- ${x}`).join("\n") || "- derive the next plan from remaining acceptance"}\nAcceptance criteria:\n${acceptance.map((x) => `- ${x}`).join("\n") || "- verify the user's requested outcome"}\n\nTreat completed work and failed approaches as established evidence. Do not restart or repeat an exhausted action unless relevant state changed. Replan and continue automatically.`;
}
