import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { shouldFail } from "../../src/policy/policy.js";
import {
  REVIEWER_SUBMISSION_VERDICTS,
  TERMINAL_VERDICTS,
  createErrorReport,
  createInconclusiveReport,
  renderMarkdown,
  validateSubmission,
  writeReports,
} from "../../src/reports/report.js";

test("reviewer submissions and terminal reports have distinct verdict sets", () => {
  assert.deepEqual(REVIEWER_SUBMISSION_VERDICTS, ["pass", "warn", "fail"]);
  assert.deepEqual(TERMINAL_VERDICTS, [
    "pass",
    "warn",
    "fail",
    "inconclusive",
    "error",
  ]);
});

const validSubmission = {
  verdict: "fail",
  summary: "A correctness defect was found.",
  findings: [
    {
      severity: "high",
      title: "Subtraction replaces addition",
      explanation: "The implementation no longer matches the function contract.",
      recommendation: "Restore addition.",
      evidence: [{ path: "app.js", line: 2, detail: "Returns a - b." }],
    },
  ],
};

test("validateSubmission normalizes findings and computes severity", () => {
  const result = validateSubmission(validSubmission);
  assert.equal(result.maxSeverity, "high");
  assert.equal(result.verdict, "fail");
  assert.equal(result.findings[0].id, "finding-1");
});

test("validateSubmission derives a verdict consistent with findings", () => {
  assert.equal(
    validateSubmission({ verdict: "fail", summary: "No findings.", findings: [] })
      .verdict,
    "pass",
  );
  assert.equal(
    validateSubmission({
      ...validSubmission,
      verdict: "pass",
      findings: [{ ...validSubmission.findings[0], severity: "medium" }],
    }).verdict,
    "warn",
  );
});

test("validateSubmission rejects unsupported severity and missing fields", () => {
  assert.throws(
    () =>
      validateSubmission({
        ...validSubmission,
        findings: [{ ...validSubmission.findings[0], severity: "none" }],
      }),
    /severity must be one of/,
  );
  assert.throws(() => validateSubmission({ verdict: "pass", findings: [] }), /summary/);
});

test("policy maps severity thresholds and always fails framework errors", () => {
  const report = { status: "completed", verdict: "fail", maxSeverity: "high" };
  assert.equal(shouldFail(report, "high"), true);
  assert.equal(shouldFail(report, "critical"), false);
  assert.equal(shouldFail(report, "never"), false);
  assert.equal(
    shouldFail({ status: "error", verdict: "error", maxSeverity: "none" }, "never"),
    true,
  );
  assert.equal(
    shouldFail(
      {
        status: "inconclusive",
        verdict: "inconclusive",
        maxSeverity: "none",
      },
      "low",
    ),
    true,
  );
});

test("terminal reports share one envelope with outcome-specific fields", () => {
  const input = {
    config: {
      agentId: "reviewer",
      promptFile: ".cacophony/agents/reviewer.md",
      provider: "azure-foundry",
      deployment: "review-model",
    },
    context: { pullRequest: { number: 7 } },
    startedAt: "2026-01-01T00:00:00.000Z",
  };
  const errorReport = createErrorReport({
    ...input,
    error: new Error("framework failed"),
  });

  const inconclusiveReport = createInconclusiveReport({
    ...input,
    reason: new Error("provider unavailable"),
  });

  assert.deepEqual(Object.keys(errorReport), Object.keys(inconclusiveReport));
  assert.deepEqual(errorReport.agent, inconclusiveReport.agent);
  assert.deepEqual(errorReport.provider, inconclusiveReport.provider);
  assert.deepEqual(errorReport.pullRequest, inconclusiveReport.pullRequest);
  assert.deepEqual(errorReport.execution, inconclusiveReport.execution);
  assert.equal(errorReport.status, "error");
  assert.equal(errorReport.verdict, "error");
  assert.equal(errorReport.summary, "framework failed");
  assert.equal(inconclusiveReport.status, "inconclusive");
  assert.equal(inconclusiveReport.verdict, "inconclusive");
  assert.equal(inconclusiveReport.summary, "provider unavailable");
});

test("repository audit reports identify the audited target", () => {
  const context = {
    repository: {
      name: "example/repository",
      sha: "a".repeat(40),
      ref: "main",
      actor: "octocat",
      url: "https://github.com/example/repository",
    },
  };
  const report = createInconclusiveReport({
    reason: new Error("provider unavailable"),
    config: {
      agentId: "reviewer",
      promptFile: ".cacophony/agents/reviewer.md",
      provider: "azure-foundry",
      deployment: "review-model",
      reviewScope: "repository",
    },
    context,
    startedAt: "2026-01-01T00:00:00.000Z",
  });
  assert.equal(report.reviewScope, "repository");
  assert.equal(report.pullRequest, null);
  assert.deepEqual(report.repository, context.repository);
});

test("renderMarkdown derives readable output from canonical data", () => {
  const submission = validateSubmission(validSubmission);
  const markdown = renderMarkdown({
    schemaVersion: "1.0",
    status: "completed",
    agent: { id: "correctness" },
    provider: { name: "azure-foundry", deployment: "model" },
    execution: { turns: 2, toolCalls: 3 },
    ...submission,
  });
  assert.match(markdown, /# Cacophony: correctness/);
  assert.match(markdown, /app\.js:2/);
  assert.match(markdown, /Restore addition/);
});

test("renderMarkdown identifies a repository audit commit", () => {
  const markdown = renderMarkdown({
    schemaVersion: "1.0",
    status: "completed",
    reviewScope: "repository",
    agent: { id: "security" },
    provider: { name: "azure-foundry", deployment: "model" },
    repository: {
      name: "example/repository",
      sha: "a".repeat(40),
    },
    pullRequest: null,
    execution: { turns: 2, toolCalls: 3 },
    verdict: "pass",
    maxSeverity: "none",
    summary: "[APPROVED]",
    findings: [],
  });
  assert.match(markdown, /\*\*Repository:\*\* example\/repository/);
  assert.match(markdown, new RegExp(`\\*\\*Commit:\\*\\* ${"a".repeat(40)}`));
});

test("writeReports rejects output symlinks that escape the workspace", async (t) => {
  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cacophony-report-"));
  const outside = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cacophony-report-out-"));
  t.after(async () => {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await fs.promises.rm(outside, { recursive: true, force: true });
  });
  await fs.promises.mkdir(path.join(workspace, ".cacophony"), { recursive: true });
  await fs.promises.symlink(outside, path.join(workspace, ".cacophony", "out"));

  await assert.rejects(
    () =>
      writeReports(
        {
          agent: { id: "reviewer" },
          provider: { name: "test", deployment: "test" },
          execution: { turns: 1, toolCalls: 1 },
          status: "completed",
          verdict: "pass",
          maxSeverity: "none",
          summary: "No findings.",
          findings: [],
        },
        workspace,
        ".cacophony/out",
      ),
    /outside the workspace/,
  );
  await assert.rejects(() => fs.promises.stat(path.join(outside, "reviewer")), {
    code: "ENOENT",
  });
});
