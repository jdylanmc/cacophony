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
  assert.equal(result.rateLimitRetries, 2);
  assert.equal(result.failOn, "high");
  assert.equal(result.reviewScope, "pull-request");
  assert.equal(result.workspaceDirectory, ".");
  assert.deepEqual(result.evidenceFiles, []);
  assert.equal(result.outputDirectory, ".cacophony/out");
});

test("readInputs accepts declared evidence files", () => {
  const result = readInputs(
    validEnv({
      "INPUT_EVIDENCE-FILES":
        ".cacophony/evidence/codeql.sarif\n.cacophony/evidence/tests.xml",
    }),
  );
  assert.deepEqual(result.evidenceFiles, [
    ".cacophony/evidence/codeql.sarif",
    ".cacophony/evidence/tests.xml",
  ]);
});

test("readInputs accepts repository audit scope", () => {
  const result = readInputs(
    validEnv({ "INPUT_REVIEW-SCOPE": "repository" }),
  );
  assert.equal(result.reviewScope, "repository");
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
    () => readInputs(validEnv({ "INPUT_MAX-TURNS": "51" })),
    /between 1 and 50/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_FAIL-ON": "none" })),
    /fail-on must be one of/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_RATE-LIMIT-RETRIES": "11" })),
    /between 0 and 10/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_REVIEW-SCOPE": "workspace" })),
    /review-scope must be/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_WORKSPACE-DIRECTORY": "../outside" })),
    /cannot leave/,
  );
  assert.throws(
    () => readInputs(validEnv({ "INPUT_EVIDENCE-FILES": "../outside.sarif" })),
    /cannot leave/,
  );
  assert.throws(
    () =>
      readInputs(
        validEnv({
          "INPUT_EVIDENCE-FILES":
            ".cacophony/evidence/report.json\n.cacophony/evidence/report.json",
        }),
      ),
    /duplicate/,
  );
});

test("normalizeAgentId requires usable characters", () => {
  assert.equal(normalizeAgentId(".cacophony/agents/My Lens.md"), "my-lens");
  assert.throws(() => normalizeAgentId(".cacophony/agents/---.md"), /non-empty/);
});
