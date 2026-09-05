---
name: dns
version: 1.0.0
updatedAt: 2026-09-05
description: Resolve domain records and compare them with the exact owned target.
---

# Purpose
Produce compact DNS evidence for target binding and deployment verification.

# Activation
Use for DNS, domains, A/AAAA/CNAME records, ACME, TLS, or public routing.

# Source/Reference Priority
1. Authoritative/public DNS observations. 2. Bound target metadata. 3. Provider configuration. 4. Bundled notes.

# Workflow
Resolve only requested hostnames, normalize records, compare against the bound server, and report propagation or ownership blockers.

# Safety/Boundaries
Do not mutate unrelated zones or infer authorization for registrar changes.

# Failure Recovery
Distinguish NXDOMAIN, propagation, wrong target, and resolver failure before retrying.

# Verification
Require stable public records matching the intended target.

# Output Contract
Return structured records, match state, blockers, and usage.

# References
No external reference is bundled.

# Scripts
Use `scripts/normalize-records.mjs`.
