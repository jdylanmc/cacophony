import test from "node:test";
import assert from "node:assert/strict";

import {
  REVIEWER_SUBMISSION_VERDICTS,
  TERMINAL_VERDICTS,
  createCompletedReport,
  createErrorReport,
  createInconclusiveReport,
  severityRank,
  validateSubmission,
} from "../../src/reports/model.js";

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

const reportInput = {
  config: {
    agentId: "reviewer",
    promptFile: ".cacophony/agents/reviewer.md",
    provider: "azure-foundry",
    deployment: "review-model",
  },
  target: {
    kind: "pull-request",
    reportTarget: {
      pullRequest: { number: 7 },
      repository: null,
    },
  },
  startedAt: "2026-01-01T00:00:00.000Z",
};

test("model owns the canonical severity and verdict vocabulary", () => {
  assert.equal(severityRank("none"), 0);
  assert.equal(severityRank("critical"), 4);
  assert.throws(() => severityRank("urgent"), /Invalid severity/);
  assert.deepEqual(REVIEWER_SUBMISSION_VERDICTS, ["pass", "warn", "fail"]);
  assert.deepEqual(TERMINAL_VERDICTS, [
    "pass",
    "warn",
    "fail",
    "inconclusive",
    "error",
  ]);
});

test("validateSubmission normalizes findings and derives the canonical outcome", () => {
  const result = validateSubmission({
    ...validSubmission,
    verdict: " pass ",
    limitations: "  Reviewed changed lines only.  ",
  });

  assert.deepEqual(result, {
    verdict: "fail",
    maxSeverity: "high",
    summary: "A correctness defect was found.",
    limitations: "Reviewed changed lines only.",
    findings: [
      {
        id: "finding-1",
        severity: "high",
        title: "Subtraction replaces addition",
        explanation: "The implementation no longer matches the function contract.",
        recommendation: "Restore addition.",
        evidence: [{ path: "app.js", line: 2, detail: "Returns a - b." }],
      },
    ],
  });
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

test("validateSubmission preserves validation error behavior", () => {
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

test("completed report factory preserves the public report envelope", () => {
  const submission = validateSubmission(validSubmission);
  const report = createCompletedReport({
    ...reportInput,
    submission,
    turns: 2,
    toolCalls: 3,
  });

  assert.deepEqual(
    {
      ...report,
      completedAt: "<timestamp>",
    },
    {
      schemaVersion: "1.0",
      status: "completed",
      agent: {
        id: "reviewer",
        promptFile: ".cacophony/agents/reviewer.md",
      },
      provider: {
        name: "azure-foundry",
        deployment: "review-model",
      },
      reviewScope: "pull-request",
      pullRequest: { number: 7 },
      repository: null,
      startedAt: "2026-01-01T00:00:00.000Z",
      completedAt: "<timestamp>",
      execution: { turns: 2, toolCalls: 3 },
      ...submission,
    },
  );
});

test("terminal report factories share one envelope with outcome-specific fields", () => {
  const errorReport = createErrorReport({
    ...reportInput,
    error: new Error("framework failed"),
  });
  const inconclusiveReport = createInconclusiveReport({
    ...reportInput,
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

test("terminal reports identify repository audit targets", () => {
  const repository = {
    name: "example/repository",
    sha: "a".repeat(40),
    ref: "main",
    actor: "octocat",
    url: "https://github.com/example/repository",
  };
  const report = createInconclusiveReport({
    reason: new Error("provider unavailable"),
    config: {
      ...reportInput.config,
      reviewScope: "repository",
    },
    target: {
      kind: "repository",
      reportTarget: {
        pullRequest: null,
        repository,
      },
    },
    startedAt: reportInput.startedAt,
  });

  assert.equal(report.reviewScope, "repository");
  assert.equal(report.pullRequest, null);
  assert.deepEqual(report.repository, repository);
});
