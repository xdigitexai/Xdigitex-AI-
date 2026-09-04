import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomain, parseInfrastructureRequest, occupiedPortsFromSs, selectFreePort, assertExactDeploymentTarget, LoopDetector } from "../deployment-runtime.mjs";

test("domain confusion: exact api domain never aliases similar sites", () => {
  assert.equal(normalizeDomain(" API.Example.com. "), "api.example.com");
  for (const domain of ["ai.example.com", "app.example.com", "api2.example.com", "example.com"]) assert.throws(() => assertExactDeploymentTarget({ serverId: 1, projectPath: "/var/www/new", domain: "api.example.com", port: 5300 }, { serverId: 1, projectPath: "/var/www/new", domain, port: 5300 }), /Domain identity mismatch/);
});

test("similar project paths require exact normalized identity", () => {
  for (const projectPath of ["/var/www/libia-ai-old", "/var/www/libia-AI-test"]) assert.throws(() => assertExactDeploymentTarget({ serverId: 1, projectPath: "/var/www/libia-ai", domain: "api.example.com", port: 5300 }, { serverId: 1, projectPath, domain: "api.example.com", port: 5300 }), /Project path mismatch/);
});

test("free port selection uses observed sockets and preserves occupied services", () => {
  const occupied = occupiedPortsFromSs("LISTEN 0 511 0.0.0.0:3000\nLISTEN 0 511 [::]:3001\nLISTEN 0 511 127.0.0.1:5223\nLISTEN 0 511 0.0.0.0:5224\nLISTEN 0 511 0.0.0.0:8080");
  const port = selectFreePort(occupied, { min: 5223, max: 5226 });
  assert.equal(port, 5225); assert.equal(occupied.has(5223), true); assert.equal(occupied.has(5224), true);
});

test("request parser gives current explicit deployment fields authority", () => {
  const parsed = parseInfrastructureRequest("Build /var/www/test on a free port and connect test-api.example.com. Do not affect existing sites; verify SSL.");
  assert.deepEqual({ action: parsed.action, projectPath: parsed.projectPath, domain: parsed.domain, portStrategy: parsed.portStrategy }, { action: "deployment", projectPath: "/var/www/test", domain: "test-api.example.com", portStrategy: "AUTO_FREE_PORT" });
  assert.equal(parsed.constraints.preserveExistingServices, true); assert.equal(parsed.constraints.mustVerifySsl, true);
});

test("loop prevention bounds identical failures and enters recovery", () => {
  const detector = new LoopDetector({ maxIdentical: 3, stuckAfter: 5 });
  let result;
  for (let i = 0; i < 5; i++) result = detector.record({ tool: "shell", input: { command: "pnpm build" }, error: "TS2322", target: "/var/www/app" }, {});
  assert.equal(result.retryAllowed, false); assert.equal(result.strategyChangeRequired, true); assert.equal(result.stuck, true);
});
