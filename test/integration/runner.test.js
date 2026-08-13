import test from "node:test";
import assert from "node:assert/strict";

import { runReview } from "../../src/runner/review.js";
import {
  createPullRequestFixture,
  removeFixture,
} from "../helpers.js";

test("review runner executes tools and requires structured submission", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  let turn = 0;
  const provider = {
    async turn(request) {
      turn += 1;
      assert.match(request.instructions, /correctness defects/);
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
    context: fixture.context,
    workspace: fixture.workspace,
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
        context: fixture.context,
        workspace: fixture.workspace,
        provider,
        signal: new AbortController().signal,
        startedAt: new Date().toISOString(),
      }),
    /did not submit/,
  );
});
