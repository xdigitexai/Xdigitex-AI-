import { createHash } from "node:crypto"
import { compactSpecialistResult } from "./compaction.mjs"

const unique = values => [...new Set((values || []).filter(Boolean).map(String))]

export class ResourceLockManager {
  #held = new Map()
  acquire(owner, resources = []) {
    const wanted = unique(resources).sort()
    const conflict = wanted.find(resource => this.#held.has(resource) && this.#held.get(resource) !== owner)
    if (conflict) return { acquired: false, conflict, owner: this.#held.get(conflict) }
    for (const resource of wanted) this.#held.set(resource, owner)
    return { acquired: true, resources: wanted }
  }
  release(owner) { for (const [resource, holder] of this.#held) if (holder === owner) this.#held.delete(resource) }
  snapshot() { return [...this.#held].map(([resource, owner]) => ({ resource, owner })) }
}

export class SpecialistScheduler {
  constructor({ maxParallel = 3, maxDepth = 2, locks = new ResourceLockManager() } = {}) {
    this.maxParallel = maxParallel; this.maxDepth = maxDepth; this.locks = locks
  }
  plan(tasks = [], { availableCredits = Infinity, estimatedCredits = {} } = {}) {
    let reserved = 0
    return tasks.map(task => {
      const cost = Math.max(0, Number(estimatedCredits[task.owner] ?? task.estimatedCredits ?? 0))
      const depth = Number(task.depth || 0)
      const dependenciesReady = (task.dependencies || []).every(key => tasks.some(item => item.semanticKey === key && item.status === "completed"))
      const locks = this.locks.acquire(task.id, task.resources)
      const runnable = depth <= this.maxDepth && dependenciesReady && locks.acquired && reserved + cost <= availableCredits
      if (runnable) reserved += cost; else if (locks.acquired) this.locks.release(task.id)
      return { ...task, runnable, reason: runnable ? null : depth > this.maxDepth ? "DEPTH_LIMIT" : !dependenciesReady ? "DEPENDENCY_PENDING" : !locks.acquired ? `LOCKED:${locks.conflict}` : "CREDIT_RESERVATION", reservedCredits: runnable ? cost : 0 }
    }).filter((task, index, all) => task.runnable ? all.slice(0, index + 1).filter(item => item.runnable).length <= this.maxParallel : true)
  }
  async execute(tasks, worker, options) {
    const planned = this.plan(tasks, options), runnable = planned.filter(task => task.runnable).slice(0, this.maxParallel)
    const settled = await Promise.all(runnable.map(async task => { try { return { task, result: compactSpecialistResult(await worker(task)) } } finally { this.locks.release(task.id) } }))
    return { planned, settled }
  }
}

export function mergeSpecialistResults(results = []) {
  const merged = { findings: [], completedTasks: [], newTasks: [], contextUpdates: {}, changes: [], verification: [], blockers: [], usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, credits: 0, costUsd: 0 } }
  const seen = new Set()
  for (const entry of results) {
    const result = entry?.result || entry || {}
    for (const key of ["findings", "completedTasks", "newTasks", "changes", "verification", "blockers"]) for (const item of result[key] || []) { const hash=createHash("sha256").update(JSON.stringify(item)).digest("hex"); if(!seen.has(`${key}:${hash}`)){seen.add(`${key}:${hash}`);merged[key].push(item)} }
    Object.assign(merged.contextUpdates, result.contextUpdates || {})
    for (const key of Object.keys(merged.usage)) merged.usage[key] += Number(result.usage?.[key] || 0)
  }
  return merged
}
