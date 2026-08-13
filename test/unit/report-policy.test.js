import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { shouldFail } from "../../src/policy/policy.js";
import {
  renderMarkdown,
  validateSubmission,
  writeReports,
} from "../../src/reports/report.js";

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
