import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAgentId, readInputs } from "../../src/inputs.js";

function validEnv(overrides = {}) {
  return {
    "INPUT_PROMPT-FILE": ".cacophony/agents/Security Review.md",
    INPUT_ENDPOINT: "https://example.services.ai.azure.com/api/projects/project",
    INPUT_DEPLOYMENT: "review-model",
    ...overrides,
  };
}

test("readInputs applies simple defaults", () => {
  const result = readInputs(validEnv());
  assert.equal(result.agentId, "security-review");
  assert.equal(result.provider, "azure-foundry");
  assert.equal(result.maxTurns, 8);
  assert.equal(result.timeoutSeconds, 300);
  assert.equal(result.failOn, "high");
  assert.equal(result.outputDirectory, ".cacophony/out");
});

test("readInputs rejects prompts outside .cacophony", () => {
  assert.throws(
    () => readInputs(validEnv({ "INPUT_PROMPT-FILE": "prompts/review.md" })),
    /under \.cacophony/,
  );
});

test("readInputs rejects traversal and invalid bounds", () => {
  assert.throws(
    () => readInputs(validEnv({ "INPUT_PROMPT-FILE": ".cacophony/../secret.md" })),
    /under \.cacophony/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_MAX-TURNS": "21" })),
    /between 1 and 20/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_FAIL-ON": "none" })),
    /fail-on must be one of/,
  );
});

test("normalizeAgentId requires usable characters", () => {
  assert.equal(normalizeAgentId(".cacophony/agents/My Lens.md"), "my-lens");
  assert.throws(() => normalizeAgentId(".cacophony/agents/---.md"), /non-empty/);
});
