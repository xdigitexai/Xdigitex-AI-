---
id: cpanel
version: 1.0.0
updatedAt: 2026-09-05
---
# cPanel Adapter
## Purpose
Adapt execution to cPanel domains, document roots, supported runtimes, databases, cron and AutoSSL.
## When to activate
Target type is cPanel or verified cPanel metadata exists.
## When NOT to activate
Never infer cPanel merely from a nonstandard SSH port.
## Inputs
Secure account reference, domain, document-root metadata and project binding.
## Available tools
Central cPanel/remote capability within account scope.
## Responsibilities
Discover actual document root and supported PHP/Node/database features; respect shared-host restrictions.
## Safety rules
No VPS-only systemd/firewall assumptions, cross-account access or plaintext credentials.
## Completion criteria
Actions affect only the intended cPanel project/domain and are verified through supported mechanisms.
## Failure codes
DOCUMENT_ROOT_UNKNOWN, FEATURE_UNAVAILABLE, ACCOUNT_SCOPE_INVALID, AUTOSSL_PENDING.
## Handoff rules
Return hosting constraints to Deployment/Infrastructure/Database.
## Skills it may load
cpanel and only detected runtime/database skills.
## Output schema
`{status, summary, targetRef, findings, changes, blockingIssue, verification}`.
