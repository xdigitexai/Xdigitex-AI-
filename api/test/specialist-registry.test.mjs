import test from "node:test";
import assert from "node:assert/strict";
import { loadRegistrySelection, selectSpecialists, selectSkills } from "../agent-engine/v1/registry.mjs";

const route = (request, context = {}, todo = []) => selectSpecialists({ request, context, todo });

test("deployment selects deployment, GitHub, target and testing without unrelated libraries", () => {
  const input = { request: "Deploy github.com/acme/app to app.example.com with nginx", context: { target: { type: "vps" } } };
  const agents = selectSpecialists(input);
  assert.deepEqual(new Set(agents), new Set(["orchestrator", "deployment", "testing", "github", "infrastructure", "vps"]));
  const skills = selectSkills(input, agents);
  assert.ok(skills.includes("git") && skills.includes("nginx"));
  assert.ok(!skills.includes("react") && !skills.includes("postgres") && !skills.includes("docker"));
});

test("coding from scratch routes to coding domains discovered in request", () => {
  const agents = route("Build a React booking application with an Express API and PostgreSQL");
  for (const id of ["orchestrator", "coding", "frontend", "backend", "database"]) assert.ok(agents.includes(id), id);
  assert.ok(!agents.includes("deployment") && !agents.includes("github"));
});

test("git-only request stays isolated", () => {
  assert.deepEqual(route("Fetch origin and checkout branch release"), ["orchestrator", "github"]);
});

test("frontend-only failure excludes database and deployment", () => {
  const agents = route("Fix the missing CSS and broken React asset paths");
  assert.ok(agents.includes("frontend") && agents.includes("debugging") && agents.includes("coding"));
  assert.ok(!agents.includes("database") && !agents.includes("deployment"));
});

test("database debugging routes narrowly", () => {
  const agents = route("Debug why orders are not saving to PostgreSQL from the API");
  for (const id of ["orchestrator", "debugging", "coding", "database", "backend"]) assert.ok(agents.includes(id), id);
  assert.ok(!agents.includes("frontend") && !agents.includes("deployment"));
});

test("loader reads only selected versioned documents", () => {
  const loaded = loadRegistrySelection({ request: "Pull latest changes" });
  assert.deepEqual(loaded.agents.map(x => x.id), ["orchestrator", "github"]);
  assert.deepEqual(loaded.skills.map(x => x.id), ["git"]);
  assert.ok(loaded.agents.every(x => x.version === "1.0.0" && x.document.includes("## Output schema")));
});
