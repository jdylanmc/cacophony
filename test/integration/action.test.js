import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createPullRequestFixture,
  removeFixture,
} from "../helpers.js";

const execFileAsync = promisify(execFile);
const actionEntry = path.resolve("src/index.js");

test("action writes reports and outputs before applying policy", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  let requestCount = 0;
  const secret = "action-test-secret";
  const server = http.createServer(async (incoming, response) => {
    for await (const _chunk of incoming) {
      // Drain the request before responding.
    }
    requestCount += 1;
    const output =
      requestCount === 1
        ? [
            {
              type: "function_call",
              call_id: "call-1",
              name: "get_diff",
              arguments: JSON.stringify({ path: "app.js" }),
            },
          ]
        : [
            {
              type: "function_call",
              call_id: "call-2",
              name: "submit_report",
              arguments: JSON.stringify({
                verdict: "fail",
                summary: "A high-severity correctness issue was found.",
                findings: [
                  {
                    severity: "high",
                    title: "Incorrect arithmetic",
                    explanation: "The add function subtracts.",
                    recommendation: "Restore addition.",
                    evidence: [
                      { path: "app.js", line: 2, detail: "Returns a - b." },
                    ],
                  },
                ],
              }),
            },
          ];
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ id: `response-${requestCount}`, output }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const { port } = server.address();
  const outputFile = path.join(fixture.workspace, "github-output.txt");
  await fs.promises.writeFile(outputFile, "");

  let processError;
  try {
    await execFileAsync(process.execPath, [actionEntry], {
      cwd: fixture.workspace,
      env: {
        ...process.env,
        GITHUB_WORKSPACE: fixture.workspace,
        GITHUB_EVENT_PATH: fixture.eventPath,
        GITHUB_OUTPUT: outputFile,
        CACOPHONY_AZURE_API_KEY: secret,
        "INPUT_PROMPT-FILE": ".cacophony/agents/reviewer.md",
        INPUT_PROVIDER: "azure-foundry",
        INPUT_ENDPOINT: `http://127.0.0.1:${port}`,
        INPUT_DEPLOYMENT: "review-model",
        "INPUT_FAIL-ON": "high",
      },
      encoding: "utf8",
    });
    assert.fail("Expected the high-severity finding to fail the action");
  } catch (error) {
    processError = error;
    assert.equal(error.code, 1);
  }

  const outputs = await fs.promises.readFile(outputFile, "utf8");
  const reportPath = path.join(
    fixture.workspace,
    ".cacophony",
    "out",
    "reviewer",
    "report.json",
  );
  const report = JSON.parse(await fs.promises.readFile(reportPath, "utf8"));
  assert.equal(report.maxSeverity, "high");
  assert.match(outputs, /verdict<<.*\nfail\n/s);
  assert.match(outputs, /report-json<<.*report\.json/s);
  assert.match(processError.stdout, /Cacophony wrote/);
  assert.doesNotMatch(
    `${processError.stdout}${processError.stderr}${outputs}`,
    new RegExp(secret),
  );
});

test("action writes an error report when authentication is missing", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));
  const outputFile = path.join(fixture.workspace, "github-output.txt");
  await fs.promises.writeFile(outputFile, "");

  await assert.rejects(
    () =>
      execFileAsync(process.execPath, [actionEntry], {
        cwd: fixture.workspace,
        env: {
          ...process.env,
          GITHUB_WORKSPACE: fixture.workspace,
          GITHUB_EVENT_PATH: fixture.eventPath,
          GITHUB_OUTPUT: outputFile,
          CACOPHONY_AZURE_API_KEY: "",
          "INPUT_PROMPT-FILE": ".cacophony/agents/reviewer.md",
          INPUT_ENDPOINT: "https://example.invalid",
          INPUT_DEPLOYMENT: "review-model",
        },
        encoding: "utf8",
      }),
    (error) => error.code === 1,
  );

  const report = JSON.parse(
    await fs.promises.readFile(
      path.join(
        fixture.workspace,
        ".cacophony",
        "out",
        "reviewer",
        "report.json",
      ),
      "utf8",
    ),
  );
  assert.equal(report.status, "error");
  assert.match(report.summary, /CACOPHONY_AZURE_API_KEY/);
  assert.match(await fs.promises.readFile(outputFile, "utf8"), /verdict<<.*\nerror\n/s);
});
