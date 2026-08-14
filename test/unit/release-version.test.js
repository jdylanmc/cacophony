import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

import { selectReleaseVersion } from "../../scripts/select-release-version.mjs";

test("the first release uses the package base version", () => {
  assert.deepEqual(selectReleaseVersion("0.1.0"), {
    tag: "v0.1.0",
    majorTag: "v0",
    minorTag: "v0.1",
  });
});

test("subsequent releases increment the highest published patch", () => {
  assert.deepEqual(
    selectReleaseVersion("0.1.0", ["v0.1.3", "v0.1.1", "v0.1.2"]),
    {
      tag: "v0.1.4",
      majorTag: "v0",
      minorTag: "v0.1",
    },
  );
});

test("a newer package baseline starts a new release line", () => {
  assert.deepEqual(selectReleaseVersion("1.0.0", ["v0.9.8"]), {
    tag: "v1.0.0",
    majorTag: "v1",
    minorTag: "v1.0",
  });
});

test("prerelease and malformed versions fail closed", () => {
  for (const invalid of ["", "1", "v1.2", "v1.2.3-beta.1", "latest"]) {
    assert.throws(
      () => selectReleaseVersion(invalid),
      /stable semantic version/,
    );
  }
  assert.throws(
    () => selectReleaseVersion("1.0.0", ["not-a-release"]),
    /stable semantic version/,
  );
});

test("the selector CLI writes GitHub outputs", async (t) => {
  const scratch = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "cacophony-release-version-"),
  );
  t.after(() => fs.promises.rm(scratch, { recursive: true, force: true }));
  const outputPath = path.join(scratch, "github-output.txt");

  const result = spawnSync(
    process.execPath,
    [path.resolve("scripts/select-release-version.mjs")],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        BASE_VERSION: "0.1.0",
        RELEASE_TAGS: "v0.1.0\nv0.1.1",
        GITHUB_OUTPUT: outputPath,
      },
    },
  );

  assert.equal(result.status, 0);
  assert.equal(
    await fs.promises.readFile(outputPath, "utf8"),
    "tag=v0.1.2\nmajor-tag=v0\nminor-tag=v0.1\n",
  );
});
