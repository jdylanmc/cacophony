import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

const execFileAsync = promisify(execFile);

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

test("Hello World sample reports a message and programmer joke", async () => {
  const action = await fs.promises.readFile(
    "examples/hello-world/action.yml",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/hello-world.yml",
    "utf8",
  );
  assert.match(action, /run\.sh/);
  assert.match(workflow, /uses: \.\/examples\/hello-world/);
  assert.match(workflow, /test "\$MESSAGE" = "Hello World"/);

  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cacophony-hello-"));
  const output = path.join(directory, "output");
  const summary = path.join(directory, "summary");
  await Promise.all([
    fs.promises.writeFile(output, ""),
    fs.promises.writeFile(summary, ""),
  ]);
  try {
    const result = await execFileAsync(
      "bash",
      ["examples/hello-world/run.sh"],
      {
        env: {
          ...process.env,
          GITHUB_OUTPUT: output,
          GITHUB_STEP_SUMMARY: summary,
        },
        encoding: "utf8",
      },
    );
    assert.match(result.stdout, /Hello World/);
    assert.match(result.stdout, /programmers prefer dark mode/);
    assert.match(await fs.promises.readFile(output, "utf8"), /message=Hello World/);
    assert.match(await fs.promises.readFile(summary, "utf8"), /sample succeeded/);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true });
  }
});
