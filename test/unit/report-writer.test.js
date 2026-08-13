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

  const paths = await writeReports(
    report,
    "rendered report\n",
    workspace,
    ".cacophony/out",
  );

  assert.deepEqual(
    {
      jsonRelative: paths.jsonRelative,
      markdownRelative: paths.markdownRelative,
    },
    {
      jsonRelative: path.join(".cacophony", "out", "reviewer", "report.json"),
      markdownRelative: path.join(".cacophony", "out", "reviewer", "report.md"),
    },
  );
  assert.equal(
    await fs.promises.readFile(paths.jsonPath, "utf8"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  assert.equal(await fs.promises.readFile(paths.markdownPath, "utf8"), "rendered report\n");
  assert.deepEqual(
    (await fs.promises.readdir(path.dirname(paths.jsonPath))).sort(),
    ["report.json", "report.md"],
  );
});

test("writer rejects output symlinks that escape the workspace", async (t) => {
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
        report,
        "rendered report\n",
        workspace,
        ".cacophony/out",
      ),
    /outside the workspace/,
  );
  await assert.rejects(() => fs.promises.stat(path.join(outside, "reviewer")), {
    code: "ENOENT",
  });
});
