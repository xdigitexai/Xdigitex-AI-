import { createHash, randomUUID } from "node:crypto";

export const EXECUTION_TOOL = Object.freeze({ type: "function", function: { name: "run_remote_command", description: "Run one command on the server already bound to this run. Backend-owned credentials are used.", parameters: { type: "object", additionalProperties: false, required: ["command"], properties: { command: { type: "string", minLength: 1 }, description: { type: "string" }, timeout: { type: "integer", minimum: 1, maximum: 900 } } } } });
export const HOSTING_DETECTION_TOOL = Object.freeze({ type: "function", function: { name: "detect_hosting_environment", description: "Deterministically detect privilege, cPanel, web server, account home, domain metadata and SSL management in one read-only probe.", parameters: { type: "object", additionalProperties: false, required: ["domain"], properties: { domain: { type: "string", pattern: "^[a-zA-Z0-9.-]+$" } } } } });
export const EXECUTION_CAPABILITIES = Object.freeze({ toolCalling: true, streaming: false, structuredOutput: true });

function exactJson(text) { const value = String(text ?? "").trim(); const fenced = value.match(/^```json\s*([\s\S]*?)\s*```$/i); const candidate = fenced ? fenced[1].trim() : value; if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null; try { return JSON.parse(candidate); } catch { return null; } }

export function parseLegacyToolIntent(text, { executionContext = false } = {}) {
  if (!executionContext) return null;
  const parsed = exactJson(text); if (!parsed || parsed.action !== "run") return null;
  const commands = typeof parsed.command === "string" ? [{ command: parsed.command, description: parsed.description }] : Array.isArray(parsed.commands) ? parsed.commands.map(item => ({ command: item?.cmd, description: item?.desc })) : [];
  if (!commands.length || commands.some(item => typeof item.command !== "string" || !item.command.trim())) return null;
  const allowed = new Set(["action", "command", "description", "commands", "thought"]); if (Object.keys(parsed).some(key => !allowed.has(key))) return null;
  return commands.slice(0, 10).map(item => ({ id: `legacy_${randomUUID()}`, name: "run_remote_command", arguments: { command: item.command.trim(), description: String(item.description ?? parsed.thought ?? "Run remote command").slice(0, 200) }, source: "legacy_json_compat" }));
}

export function normalizeModelTurn(message, options = {}) {
  const native = Array.isArray(message?.tool_calls) ? message.tool_calls.map(call => { let args = null; try { args = JSON.parse(call?.function?.arguments || "{}"); } catch {} return { id: call?.id || `call_${randomUUID()}`, name: call?.function?.name, arguments: args, rawArguments: call?.function?.arguments, source: "native" }; }) : [];
  const legacy = native.length ? [] : parseLegacyToolIntent(message?.content, options) ?? []; const toolCalls = [...native, ...legacy];
  return { text: toolCalls.length ? "" : String(message?.content ?? ""), toolCalls, finishReason: options.finishReason ?? null, source: native.length ? "native" : legacy.length ? "legacy_json_compat" : "assistant_text" };
}

export function validateRemoteToolCall(call) {
  if (call?.name === "detect_hosting_environment") {
    const domain = String(call.arguments?.domain ?? "").toLowerCase();
    if (!/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "A valid domain is required." };
    const command = `printf 'user=%s\\nuid=%s\\naccountHome=%s\\n' "$(id -un)" "$(id -u)" "$HOME"; if [ -d /usr/local/cpanel ] || command -v uapi >/dev/null 2>&1; then echo 'cpanel=true'; else echo 'cpanel=false'; fi; for p in /usr/local/apache /usr/local/lsws /etc/httpd /etc/apache2 /etc/nginx; do [ -e "$p" ] && printf 'path=%s\\n' "$p"; done; ps -eo comm,args 2>/dev/null | grep -E '[l]itespeed|[l]shttpd|[h]ttpd|[a]pache2|[n]ginx' | head -20; if command -v uapi >/dev/null 2>&1; then uapi --output=json DomainInfo single_domain_data domain='${domain}' 2>/dev/null || true; uapi --output=json SSL installed_hosts 2>/dev/null || true; fi`;
    return { valid: true, value: { command, description: `Detect hosting environment for ${domain}`, timeout: 60 } };
  }
  if (call?.name !== "run_remote_command") return { valid: false, code: "UNKNOWN_TOOL", message: `Unknown tool: ${call?.name || "(missing)"}` };
  if (!call.arguments || typeof call.arguments !== "object") return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "Tool arguments must be valid JSON." };
  if (typeof call.arguments.command !== "string" || !call.arguments.command.trim()) return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "command is required." };
  if (call.arguments.timeout != null && (!Number.isInteger(call.arguments.timeout) || call.arguments.timeout < 1 || call.arguments.timeout > 900)) return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "timeout must be an integer from 1 to 900." };
  return { valid: true, value: { command: call.arguments.command.trim(), description: String(call.arguments.description ?? "Run remote command").slice(0, 200), timeout: call.arguments.timeout } };
}
export function toolLoopFingerprint(call, result) { return createHash("sha256").update(JSON.stringify([call.name, call.arguments, result?.stdout, result?.stderr, result?.code])).digest("hex"); }
export function partiallyVerifiedAllowed(acceptance = []) { const passed = acceptance.filter(item => item?.status === "passed").length; return passed > 0 && passed < acceptance.filter(item => item?.required !== false).length; }
