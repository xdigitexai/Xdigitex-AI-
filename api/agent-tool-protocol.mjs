import { createHash, randomUUID } from "node:crypto";

export const EXECUTION_TOOL = Object.freeze({ type: "function", function: { name: "run_remote_command", description: "Run one command on the server already bound to this run. Backend-owned credentials are used.", parameters: { type: "object", additionalProperties: false, required: ["command"], properties: { command: { type: "string", minLength: 1 }, description: { type: "string" }, timeout: { type: "integer", minimum: 1, maximum: 900 } } } } });
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
  if (call?.name !== "run_remote_command") return { valid: false, code: "UNKNOWN_TOOL", message: `Unknown tool: ${call?.name || "(missing)"}` };
  if (!call.arguments || typeof call.arguments !== "object") return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "Tool arguments must be valid JSON." };
  if (typeof call.arguments.command !== "string" || !call.arguments.command.trim()) return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "command is required." };
  if (call.arguments.timeout != null && (!Number.isInteger(call.arguments.timeout) || call.arguments.timeout < 1 || call.arguments.timeout > 900)) return { valid: false, code: "INVALID_TOOL_ARGUMENTS", message: "timeout must be an integer from 1 to 900." };
  return { valid: true, value: { command: call.arguments.command.trim(), description: String(call.arguments.description ?? "Run remote command").slice(0, 200), timeout: call.arguments.timeout } };
}
export function toolLoopFingerprint(call, result) { return createHash("sha256").update(JSON.stringify([call.name, call.arguments, result?.stdout, result?.stderr, result?.code])).digest("hex"); }
export function partiallyVerifiedAllowed(acceptance = []) { const passed = acceptance.filter(item => item?.status === "passed").length; return passed > 0 && passed < acceptance.filter(item => item?.required !== false).length; }
