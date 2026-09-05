const STATUSES = new Set(["pending", "in_progress", "completed", "blocked", "skipped"])
const OPS = new Set(["ADD_TASK", "UPDATE_TASK", "COMPLETE_TASK", "BLOCK_TASK", "SKIP_TASK", "REOPEN_TASK"])

export function semanticTaskKey(value) {
  const key = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
  if (!key) throw new TypeError("semantic task key is required")
  return key
}

export function applyTodoOperation(todo = [], operation) {
  if (!OPS.has(operation?.type)) throw new TypeError("invalid TODO operation")
  const key = semanticTaskKey(operation.taskKey || operation.task?.key)
  const items = todo.map(item => ({ ...item }))
  const index = items.findIndex(item => semanticTaskKey(item.key) === key)
  if (operation.type === "ADD_TASK") {
    if (index >= 0) return { todo: items, changed: false, item: items[index] }
    const item = normalizeTask({ ...operation.task, key })
    return { todo: [...items, item], changed: true, item }
  }
  if (index < 0) throw new Error(`TODO_NOT_FOUND:${key}`)
  const prior = items[index]
  const status = ({ COMPLETE_TASK: "completed", BLOCK_TASK: "blocked", SKIP_TASK: "skipped", REOPEN_TASK: "pending" })[operation.type]
  items[index] = normalizeTask({ ...prior, ...(operation.patch || {}), key, status: status || operation.patch?.status || prior.status })
  return { todo: items, changed: JSON.stringify(prior) !== JSON.stringify(items[index]), item: items[index] }
}

export function applyTodoOperations(todo, operations = []) {
  return operations.reduce((state, operation) => applyTodoOperation(state.todo, operation), { todo: [...todo], changed: false }).todo
}

function normalizeTask(task) {
  const status = task.status || "pending"
  if (!STATUSES.has(status)) throw new TypeError(`invalid task status: ${status}`)
  return {
    key: semanticTaskKey(task.key),
    title: String(task.title || task.key).trim(),
    owner: String(task.owner || "orchestrator").trim().toLowerCase(),
    status,
    ...(task.failureCode ? { failureCode: String(task.failureCode) } : {}),
    ...(task.summary ? { summary: String(task.summary) } : {}),
  }
}

export function renderTodoMarkdown(context) {
  const target = context.target || {}
  const targetLine = [target.type, target.host, target.sshPort && `:${target.sshPort}`].filter(Boolean).join(" ") || "Unresolved"
  const mark = { completed: "x", skipped: "-", in_progress: ">", blocked: "!", pending: " " }
  const tasks = (context.todo || []).map(item => `- [${mark[item.status]}] ${item.owner} · ${item.title} <!-- ${item.key} -->`).join("\n")
  return `# Objective\n\n${context.identity.originalRequest}\n\n# Target\n\n${targetLine}\n\n# Tasks\n\n${tasks || "- [ ] Orchestrator · Define tasks"}\n`
}
