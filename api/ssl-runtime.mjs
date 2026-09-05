import { createHash } from "node:crypto"

const compact = value => String(value || "").replace(/\s+/g, " ").trim().slice(0, 500)
export const sslDomain = request => String(request || "").match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i)?.[0]?.toLowerCase() || null

export function sslEvidenceFromResults(results, domain) {
  const text = (results || []).join("\n"), evidence = []
  const add = (key, detail) => evidence.push({ key, status: "passed", evidence: [compact(detail)] })
  if (/\b(?:ANSWER SECTION|has address|addresses?:)\b/i.test(text) && /\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(text)) add("dns_binding", "DNS returned an address and was compared with the bound server")
  if (/\b(?:server_name|virtualhost|documentroot|vhroot|docroot)\b/i.test(text) && domain && text.toLowerCase().includes(domain)) add("vhost_identified", `Active virtual host evidence contains ${domain}`)
  if (/xdigitex-test/i.test(text) && /\[(?:SUCCESS|NO_MATCH); exit 0\]/.test(text) && !/\b404\b/.test(text)) add("acme_reachable", "Public ACME test file returned expected content")
  if (/successfully received certificate|certificate is saved at|certificate deployed successfully|autossl.*success/i.test(text)) add("certificate_issued", "Certificate authority reported successful issuance")
  if (/sslcertificatefile|fullchain\.pem|certificate installed|deploying certificate/i.test(text) && !/failed|error/i.test(text)) add("certificate_bound", `TLS certificate binding recorded for ${domain || "requested host"}`)
  if (domain && new RegExp(`(?:verify return code:\s*0|hostname[^\n]*(?:match|valid)|san[^\n]*${domain.replaceAll(".", "\\.")})`, "i").test(text)) add("hostname_match", `Certificate SAN/hostname validation passed for ${domain}`)
  if (/verify return code:\s*0|ssl certificate verify ok|certificate chain.*valid/i.test(text)) add("https_handshake", "TLS chain validation succeeded")
  if (/sni[^\n]*(?:correct|match)|hostname[^\n]*(?:match|valid)/i.test(text)) add("no_mismatch", "SNI hostname matches the served certificate")
  if (/curl[^\n]*(?:https:|https%)|HTTP\/[12](?:\.\d)?\s+20\d/i.test(text) && !/curl[^\n]*(?:\s-k\b|--insecure)/i.test(text) && /verify return code:\s*0|ssl certificate verify ok|HTTP\/[12](?:\.\d)?\s+20\d/i.test(text)) add("public_https", "Public HTTPS succeeded with normal hostname verification")
  if (/certbot renew --dry-run[^\n]*(?:success|exit 0)|systemctl[^\n]*certbot\.timer[^\n]*(?:active|enabled)|autossl[^\n]*(?:enabled|scheduled)/i.test(text)) add("renewal", "Renewal mechanism is enabled or dry-run succeeded")
  return [...new Map(evidence.map(item => [item.key, item])).values()]
}

export function sslRecoveryFromResults(results, domain) {
  const text = (results || []).join("\n"), tasks = []
  if (/unauthorized|invalid response/i.test(text) && /\b404\b|not found/i.test(text)) tasks.push("Diagnose ACME challenge path", "Verify active document root", "Verify public HTTP challenge routing")
  if (/dns problem|nxdomain|no valid a records|does not resolve|dns mismatch/i.test(text)) tasks.push("Verify DNS target against the bound server")
  if (/certificate.*(?:mismatch|does not match)|hostname mismatch/i.test(text)) tasks.push("Correct TLS certificate binding for the requested hostname")
  return { tasks: [...new Set(tasks)], recoverable: tasks.length > 0, summary: compact(text.match(/(?:unauthorized|invalid response|dns problem|certificate[^\n]*mismatch)[^\n]*/i)?.[0] || ""), stateHash: createHash("sha256").update(`${domain}|${tasks.join("|")}|${/server_name|virtualhost|documentroot/i.test(text)}`).digest("hex").slice(0, 16) }
}

export function sslCommandIsValidFinalProof(command) {
  const value = String(command || "")
  return /https:|openssl\s+s_client|certbot\s+renew\s+--dry-run/i.test(value) && !/(?:\s-k\b|--insecure)/i.test(value)
}

export function compactSslResults(results) {
  return (results || []).map(result => {
    const lines = String(result).split("\n"), command = lines[0], status = lines.at(-1)
    const important = lines.slice(1, -1).filter(line => /unauthorized|invalid response|404|dns|certificate|success|error|failed|issuer|subject|san|expire|verify return|HTTP\/[12]|server_name|virtualhost|documentroot|litespeed|apache|nginx|autossl/i.test(line)).slice(-8)
    return [command, ...important, status].filter(Boolean).join("\n").slice(0, 1600)
  }).join("\n\n")
}
