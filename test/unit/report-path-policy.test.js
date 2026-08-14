import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { resolveReportDirectory } from "../../src/reports/path-policy.js";

test("report path policy creates and returns a vetted absolute destination", async (t) => {
  const workspace = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "cacophony-report-policy-"),
  );
  t.after(() => fs.promises.rm(workspace, { recursive: true, force: true }));

  const directory = await resolveReportDirectory(
    workspace,
    ".cacophony/out",
    "reviewer",
  );

  assert.equal(
    directory,
    path.join(await fs.promises.realpath(workspace), ".cacophony", "out", "reviewer"),
  );
  assert.equal((await fs.promises.stat(directory)).isDirectory(), true);
});

test("report path policy rejects workspace and symlink escapes before persistence", async (t) => {
  const workspace = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "cacophony-report-policy-"),
  );
  const outside = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "cacophony-report-policy-outside-"),
  );
  t.after(async () => {
    await fs.promises.rm(workspace, { recursive: true, force: true });
    await fs.promises.rm(outside, { recursive: true, force: true });
  });

  await assert.rejects(
    () => resolveReportDirectory(workspace, "..", "reviewer"),
    /inside the workspace/,
  );
  await assert.rejects(
    () => resolveReportDirectory(workspace, ".cacophony/out", "../reviewer"),
    /one path segment/,
  );

  await fs.promises.mkdir(path.join(workspace, ".cacophony"), {
    recursive: true,
  });
  await fs.promises.symlink(outside, path.join(workspace, ".cacophony", "out"));
  await assert.rejects(
    () =>
      resolveReportDirectory(workspace, ".cacophony/out", "reviewer"),
    /outside the workspace/,
  );
  await assert.rejects(() => fs.promises.stat(path.join(outside, "reviewer")), {
    code: "ENOENT",
  });
});
