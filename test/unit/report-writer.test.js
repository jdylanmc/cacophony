import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { writeReports } from "../../src/reports/writer.js";

const report = {
  agent: { id: "reviewer" },
  provider: { name: "test", deployment: "test" },
  execution: { turns: 1, toolCalls: 1 },
  status: "completed",
  verdict: "pass",
  maxSeverity: "none",
  summary: "No findings.",
  findings: [],
};

test("writer atomically persists caller-composed JSON and Markdown", async (t) => {
  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cacophony-report-"));
  t.after(() => fs.promises.rm(workspace, { recursive: true, force: true }));
  const reportDirectory = path.join(workspace, ".cacophony", "out", "reviewer");
  await fs.promises.mkdir(reportDirectory, { recursive: true });

  const paths = await writeReports(
    report,
    "rendered report\n",
    reportDirectory,
  );

  assert.equal(paths.jsonPath, path.join(reportDirectory, "report.json"));
  assert.equal(paths.markdownPath, path.join(reportDirectory, "report.md"));
  assert.equal(
    await fs.promises.readFile(paths.jsonPath, "utf8"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.equal(await fs.promises.readFile(paths.markdownPath, "utf8"), "rendered report\n");
  assert.deepEqual(
    (await fs.promises.readdir(path.dirname(paths.jsonPath))).sort(),
    ["report.json", "report.md"],
  );
  assert.equal((await fs.promises.stat(paths.jsonPath)).mode & 0o777, 0o600);
  assert.equal((await fs.promises.stat(paths.markdownPath)).mode & 0o777, 0o600);
});
