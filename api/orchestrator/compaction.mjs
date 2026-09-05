const SECRET_KEY = /(password|secret|token|private.?key|api.?key|credential)/i

export function selectContext(context, refs = []) {
  const selected = {}
  for (const ref of refs) {
    const parts = String(ref).split(".")
    let value = context
    for (const part of parts) value = value?.[part]
    if (value !== undefined) setPath(selected, parts, redact(value))
  }
  return selected
}

export function compactSpecialistResult(result) {
  return {
    status: result.status,
    summary: String(result.summary || "").slice(0, 2000),
    findings: (result.findings || []).slice(-12).map(redact),
    verification: (result.verification || []).slice(-12).map(redact),
    blockingIssue: redact(result.blockingIssue),
  }
}

function redact(value, key = "") {
  if (SECRET_KEY.test(key)) return "[secure reference]"
  if (Array.isArray(value)) return value.map(item => redact(item))
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]))
  return value
}

function setPath(target, parts, value) {
  let cursor = target
  for (const part of parts.slice(0, -1)) cursor = cursor[part] ||= {}
  cursor[parts.at(-1)] = value
}
