import { createHash } from "node:crypto"

export function stateHash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex").slice(0, 24)
}

export class HandoffLoopGuard {
  #attempts = new Map()
  constructor({ maxAttempts = 3 } = {}) { this.maxAttempts = maxAttempts }
  record({ taskKey, agent, failureCode = "UNKNOWN", state }) {
    const hash = stateHash(state)
    const key = `${taskKey}:${agent}:${failureCode}:${hash}`
    const attempt = (this.#attempts.get(key) || 0) + 1
    this.#attempts.set(key, attempt)
    return Object.freeze({ allowed: attempt <= this.maxAttempts, attempt, stateHash: hash, reason: attempt <= this.maxAttempts ? "RETRY_ALLOWED" : "UNCHANGED_STATE_LOOP" })
  }
  reset(taskKey) { for (const key of this.#attempts.keys()) if (key.startsWith(`${taskKey}:`)) this.#attempts.delete(key) }
}

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}
