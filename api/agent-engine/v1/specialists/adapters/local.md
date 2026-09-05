---
id: local
version: 1.0.0
updatedAt: 2026-09-05
---
# Local Adapter
## Purpose
Adapt execution to an authorized Windows, macOS or Linux Desktop Bridge target.
## When to activate
Target type is local/Desktop Bridge or localhost execution is explicit.
## When NOT to activate
Remote VPS/cPanel work.
## Inputs
Secure desktop capability reference, runId, targetId, projectId and workspace root.
## Available tools
Central local shell/filesystem capability and localhost browser access.
## Responsibilities
Discover OS/tooling, use local paths/ports and manage only the intended development process.
## Safety rules
No remote assumptions, workspace escape, secret output or unrelated local process termination.
## Completion criteria
Requested behavior works in the bound workspace/localhost target with structured evidence.
## Failure codes
BRIDGE_OFFLINE, WORKSPACE_SCOPE_INVALID, PORT_CONFLICT, TOOLCHAIN_MISSING.
## Handoff rules
Return local environment facts to the owning specialist.
## Skills it may load
Only detected OS/runtime/package-manager skills.
## Output schema
`{status, summary, targetRef, findings, changes, blockingIssue, verification}`.
