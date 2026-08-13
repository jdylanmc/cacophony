import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

test("README contains a deterministic agent installation contract", async () => {
  const readme = await fs.promises.readFile("README.md", "utf8");
  for (const required of [
    "## Instructions for Copilot or another coding agent",
    "jdylanmc/cacophony@a98e2924415fbe58324ce87e2800339614579503",
    "CACOPHONY_AZURE_API_KEY",
    "CACOPHONY_AZURE_ENDPOINT",
    "CACOPHONY_AZURE_DEPLOYMENT",
    "actions/checkout@v5",
    "actions/upload-artifact@v5",
    "fetch-depth: 0",
    "Do not use `pull_request_target`",
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("basic example includes the documented consumer files", async () => {
  const workflow = await fs.promises.readFile(
    "examples/basic/.github/workflows/cacophony.yml",
    "utf8",
  );
  const prompt = await fs.promises.readFile(
    "examples/basic/.cacophony/agents/reviewer.md",
    "utf8",
  );
  assert.match(
    workflow,
    /uses: jdylanmc\/cacophony@[a-f0-9]{40}/,
  );
  assert.doesNotMatch(workflow, /jdylanmc\/cacophony@v1/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /path: \.cacophony\/out\//);
  assert.match(prompt, /correctness defects/);
});

test("Hello World dogfood runs a model-generated joke prompt", async () => {
  const prompt = await fs.promises.readFile(
    ".cacophony/agents/hello-world.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/hello-world.yml",
    "utf8",
  );
  assert.match(prompt, /exactly `Hello World`/);
  assert.match(prompt, /programmer joke generated for this run/);
  assert.doesNotMatch(prompt, /dark mode|light attracts bugs/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(workflow, /prompt-file: \.cacophony\/agents\/hello-world\.md/);
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(workflow, /name: cacophony-hello-world/);
});

test("Gilfoyle sample matches the bootstrapped security reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/gilfoyle-security-architect.md",
    "utf8",
  );
  const samplePrompt = await fs.promises.readFile(
    "examples/reviewers/gilfoyle-security-architect.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/gilfoyle-security-architect.yml",
    "utf8",
  );

  assert.equal(samplePrompt, activePrompt);
  assert.match(activePrompt, /\[BLOCK: SECURITY\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(
    workflow,
    /prompt-file: \.cacophony\/agents\/gilfoyle-security-architect\.md/,
  );
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(workflow, /max-turns: 16/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /name: cacophony-gilfoyle-security-architect/);
});
