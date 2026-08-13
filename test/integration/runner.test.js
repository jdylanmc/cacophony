import test from "node:test";
import assert from "node:assert/strict";

import { runReview } from "../../src/runner/review.js";
import { createReviewTarget } from "../../src/scopes/review-target.js";
import {
  createPullRequestFixture,
  removeFixture,
} from "../helpers.js";

test("review runner executes tools and requires structured submission", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  const target = await createReviewTarget({
    reviewScope: "pull-request",
    eventPath: fixture.eventPath,
  });
  let turn = 0;
  const provider = {
    async turn(request) {
      turn += 1;
      assert.match(request.instructions, /correctness defects/);
      assert.match(request.instructions, new RegExp(`turn ${turn} of 4`));
      if (turn === 1) {
        return {
          id: "response-1",
          calls: [
            {
              callId: "call-1",
              name: "read_file",
              arguments: JSON.stringify({ path: "app.js" }),
            },
          ],
        };
      }
      assert.equal(request.previousResponseId, "response-1");
      assert.equal(request.input[0].type, "function_call_output");
      return {
        id: "response-2",
        calls: [
          {
            callId: "call-2",
            name: "submit_report",
            arguments: JSON.stringify({
              verdict: "fail",
              summary: "The implementation changed addition to subtraction.",
              findings: [
                {
                  severity: "high",
                  title: "Incorrect arithmetic",
                  explanation: "add now subtracts its operands.",
                  recommendation: "Return a + b.",
                  evidence: [
                    { path: "app.js", line: 2, detail: "The function returns a - b." },
                  ],
                },
              ],
            }),
          },
        ],
      };
    },
  };

  const report = await runReview({
    config: {
      promptFile: ".cacophony/agents/reviewer.md",
      agentId: "reviewer",
      provider: "azure-foundry",
      deployment: "review-model",
      maxTurns: 4,
    },
    target,
    workspace: fixture.workspace,
    actionPath: fixture.workspace,
    provider,
    signal: new AbortController().signal,
    startedAt: new Date().toISOString(),
  });

  assert.equal(report.status, "completed");
  assert.equal(report.maxSeverity, "high");
  assert.equal(report.execution.turns, 2);
  assert.equal(report.execution.toolCalls, 2);
});

test("review runner rejects agents that never submit", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  const target = await createReviewTarget({
    reviewScope: "pull-request",
    eventPath: fixture.eventPath,
  });
  const provider = {
    async turn() {
      return { id: crypto.randomUUID(), calls: [], text: "done" };
    },
  };
  await assert.rejects(
    () =>
      runReview({
        config: {
          promptFile: ".cacophony/agents/reviewer.md",
          maxTurns: 2,
        },
        target,
        workspace: fixture.workspace,
        actionPath: fixture.workspace,
        provider,
        signal: new AbortController().signal,
        startedAt: new Date().toISOString(),
      }),
    /did not submit/,
  );
});

test("review runner reserves the final turn for report submission", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  const target = await createReviewTarget({
    reviewScope: "pull-request",
    eventPath: fixture.eventPath,
  });
  let turn = 0;
  const warnings = [];
  const provider = {
    async turn(request) {
      turn += 1;
      if (turn === 1) {
        assert.match(request.instructions, /turn 1 of 3/);
        assert.match(request.instructions, /Only 2 turns remain/);
        assert.match(request.instructions, /exactly 3 total turns/);
        assert.match(request.instructions, /call\s+request_more_turns/);
        assert.ok(request.tools.some((tool) => tool.name === "read_file"));
        assert.ok(
          request.tools.some((tool) => tool.name === "request_more_turns"),
        );
        return {
          id: "response-1",
          calls: [
            {
              callId: "call-1",
              name: "read_file",
              arguments: JSON.stringify({ path: "app.js" }),
            },
            {
              callId: "call-2",
              name: "request_more_turns",
              arguments: JSON.stringify({
                requested_additional_turns: 4,
                reason: "The repository has four independent subsystems left to inspect.",
              }),
            },
          ],
        };
      }
      if (turn === 2) {
        assert.match(request.instructions, /Only 1 turn remains/);
        assert.ok(request.tools.some((tool) => tool.name === "read_file"));
        return { id: "response-2", calls: [], text: "Preparing report." };
      }

      assert.match(request.instructions, /your final turn/);
      assert.deepEqual(
        request.tools.map((tool) => tool.name),
        ["submit_report"],
      );
      return {
        id: "response-3",
        calls: [
          {
            callId: "call-3",
            name: "submit_report",
            arguments: JSON.stringify({
              verdict: "pass",
              summary: "[APPROVED]",
              findings: [],
            }),
          },
        ],
      };
    },
  };

  const report = await runReview({
    config: {
      promptFile: ".cacophony/agents/reviewer.md",
      agentId: "reviewer",
      provider: "azure-foundry",
      deployment: "review-model",
      maxTurns: 3,
    },
    target,
    workspace: fixture.workspace,
    actionPath: fixture.workspace,
    provider,
    signal: new AbortController().signal,
    startedAt: new Date().toISOString(),
    onWarning(message) {
      warnings.push(message);
    },
  });

  assert.equal(report.status, "completed");
  assert.equal(report.summary, "[APPROVED]");
  assert.equal(report.execution.turns, 3);
  assert.equal(report.execution.toolCalls, 3);
  assert.deepEqual(warnings, [
    "Reviewer requested 4 additional turns beyond the configured 3: The repository has four independent subsystems left to inspect.",
  ]);
});
