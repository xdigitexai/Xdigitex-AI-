---
name: ssl
version: 1.1.0
updatedAt: 2026-09-05
description: Issue, bind, and verify a hostname-valid TLS certificate on the exact owned target.
---

# Purpose
Complete SSL installation with evidence for DNS, ACME routing, issuance, binding, SNI, public HTTPS, and renewal.

# Activation
Use only for SSL, TLS, HTTPS, certificate, Certbot, AutoSSL, or ACME work.

# Source/Reference Priority
1. Actual target DNS, vhost, and served certificate. 2. Project/server configuration. 3. Official provider documentation when required. 4. Bundled references.

# Workflow
Run the deterministic inspector, identify the exact vhost and document root, validate a scoped challenge, select the environment-appropriate issuer, bind safely, validate configuration, reload only the target service, then verify normal public HTTPS and renewal.

# Safety/Boundaries
Never change SSH or firewall configuration, expose private keys, touch unrelated domains, or use insecure TLS as final proof.

# Failure Recovery
Treat ACME 404 as recoverable: verify document root and routing before retrying. Retry issuance only after state changes.

# Verification
Require hostname match, valid chain, correct SNI certificate, public HTTPS without `-k`, correct content, and renewal configuration.

# Output Contract
Return structured findings, changes, evidence, blockers, and usage. Never declare completion.

# References
See `references/acceptance.md`.

# Scripts
Use `scripts/inspect-ssl.mjs` for deterministic evidence extraction.
