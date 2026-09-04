import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProjectRoot, semanticTaskKey } from "../agent-task-identity.mjs";

test("database workflow objectives deduplicate semantically within project scope", () => {
  const context = { serverId: 8, projectName: "starlink-offers" };
  const variants = ["Inspect database requirements", "Detect database requirements", "Determine DB requirements", "Database requirement detected", "Inspect DB requirements"];
  assert.equal(new Set(variants.map((title) => semanticTaskKey(title, context))).size, 1);
  assert.notEqual(semanticTaskKey("Provision isolated application database", context), semanticTaskKey("Provision isolated application database", { ...context, projectName: "another-app" }));
});

test("runtime stack paths never become project roots", () => {
  const output = "/var/www/starlink-offers/scripts/node_modules/tsx/dist/register-BLUABhh3.cjs";
  assert.equal(normalizeProjectRoot(output, "starlink-offers"), "/var/www/starlink-offers");
  assert.equal(normalizeProjectRoot("at /opt/unknown/node_modules/tsx/dist/a.cjs"), null);
  assert.equal(normalizeProjectRoot("cwd=/var/www/starlink-offers", "starlink-offers"), "/var/www/starlink-offers");
});
