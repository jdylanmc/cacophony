import test from "node:test";
import assert from "node:assert/strict";

import { renderMarkdown } from "../../src/reports/renderer.js";

test("renderer preserves canonical Markdown presentation", () => {
  const markdown = renderMarkdown({
    schemaVersion: "1.0",
    status: "completed",
    reviewScope: "pull-request",
    agent: { id: "correctness" },
    provider: { name: "azure-foundry", deployment: "model" },
    pullRequest: { number: 7 },
    repository: null,
    execution: { turns: 2, toolCalls: 3 },
    verdict: "fail",
    maxSeverity: "high",
    summary: "A correctness defect was found.",
    limitations: "Changed lines only.",
    findings: [
      {
        id: "finding-1",
        severity: "high",
        title: "Subtraction replaces addition",
        explanation: "The implementation no longer matches the contract.",
        recommendation: "Restore addition.",
        evidence: [
          {
            path: "src/a|b.js",
            line: 2,
            detail: "Returns a | b.",
          },
        ],
      },
    ],
  });

  assert.equal(
    markdown,
    `# Cacophony: correctness

**Status:** completed
**Verdict:** fail
**Maximum severity:** high
**Pull request:** #7

## Summary

A correctness defect was found.

## Limitations

Changed lines only.

## Findings

### finding-1: Subtraction replaces addition

**Severity:** high

The implementation no longer matches the contract.

**Recommendation:** Restore addition.

| Location | Evidence |
| --- | --- |
| src/a\\|b.js:2 | Returns a \\| b. |

---
Provider: azure-foundry / model
Turns: 2; tool calls: 3
`,
  );
});

test("renderer identifies repository audits and empty findings", () => {
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
  assert.match(markdown, /No findings\./);
});
