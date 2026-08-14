import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { selectRepositoryAuditAgents } from "../../scripts/select-repository-audit-agents.mjs";

const expectedAgents = [
  {
    name: "Gilfoyle security audit",
    agent: "gilfoyle-security-architect",
    deployment: "gpt-5.6-sol",
  },
  {
    name: "Solid Snake architecture audit",
    agent: "solid-snake-architecture",
    deployment: "gpt-5.6-sol",
  },
  {
    name: "GLaDOS documentation audit",
    agent: "glados-documentation-sentinel",
    deployment: "gpt-5.4-mini",
  },
  {
    name: "Master Chief domain audit",
    agent: "master-chief-domain-commander",
    deployment: "gpt-5.6-sol",
  },
  {
    name: "Fletcher prompt audit",
    agent: "fletcher-prompt-conductor",
    deployment: "gpt-5.6-sol",
  },
  {
    name: "Delamain documentation custody audit",
    agent: "delamain-documentation-custodian",
    deployment: "gpt-5.4-mini",
  },
];

test("empty repository audit filter returns the exact suite in order", () => {
  assert.deepEqual(selectRepositoryAuditAgents(""), expectedAgents);
});

test("each exact canonical slug selects one complete tuple", () => {
  for (const expected of expectedAgents) {
    assert.deepEqual(selectRepositoryAuditAgents(expected.agent), [expected]);
  }
});

test("partial and unknown repository audit filters fail", () => {
  for (const invalid of ["fletcher", "fletcher-prompt", "unknown-agent"]) {
    assert.throws(
      () => selectRepositoryAuditAgents(invalid),
      /Unknown agent-filter/,
    );
  }
});

test("repository audit catalog is unique and covers every canonical prompt", async () => {
  assert.equal(
    new Set(expectedAgents.map(({ agent }) => agent)).size,
    expectedAgents.length,
  );
  assert.deepEqual(
    (await fs.promises.readdir(".cacophony/agents"))
      .filter((file) => file.endsWith(".md"))
      .sort(),
    expectedAgents.map(({ agent }) => `${agent}.md`).sort(),
  );
});

test("repository audit selector CLI writes a matrix and fails closed", async (t) => {
  const scratch = await fs.promises.mkdtemp(
    path.join(process.cwd(), ".repository-audit-selector-test-"),
  );
  t.after(() => fs.promises.rm(scratch, { recursive: true, force: true }));
  const script = path.resolve("scripts/select-repository-audit-agents.mjs");

  const outputPath = path.join(scratch, "github-output.txt");
  const selected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_FILTER: "fletcher-prompt-conductor",
      GITHUB_OUTPUT: outputPath,
    },
  });
  assert.equal(selected.status, 0);
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(outputPath, "utf8").trim().slice("matrix=".length),
    ),
    { include: [expectedAgents[4]] },
  );

  const rejected = spawnSync(process.execPath, [script], {
    encoding: "utf8",
    env: {
      ...process.env,
      AGENT_FILTER: "fletcher",
      GITHUB_OUTPUT: path.join(scratch, "rejected-output.txt"),
    },
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Unknown agent-filter/);
  assert.equal(
    fs.existsSync(path.join(scratch, "rejected-output.txt")),
    false,
  );
});
