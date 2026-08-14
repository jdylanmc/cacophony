import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createConfinedFileHandlers } from "../../src/tools/confined-files.js";
import { createEvidenceStore } from "../../src/tools/evidence-store.js";
import {
  assertRelativePath,
  ensureInside,
} from "../../src/tools/path-policy.js";
import { createToolRegistry } from "../../src/tools/tool-registry.js";

async function createDirectory(t, prefix) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("path policy rejects traversal, .git access, and escaping symlinks", async (t) => {
  const root = await createDirectory(t, "cacophony-path-root-");
  const outside = await createDirectory(t, "cacophony-path-outside-");
  await fs.promises.writeFile(path.join(outside, "secret.txt"), "secret");
  await fs.promises.symlink(
    path.join(outside, "secret.txt"),
    path.join(root, "escape.txt"),
  );

  assert.throws(() => assertRelativePath("../secret.txt"), /cannot leave/);
  assert.throws(() => assertRelativePath(".git/config"), /cannot access .git/);
  await assert.rejects(
    () => ensureInside(root, "escape.txt"),
    /outside the repository/,
  );
});

test("confined file handlers list but do not traverse symlinks", async (t) => {
  const root = await createDirectory(t, "cacophony-files-root-");
  const outside = await createDirectory(t, "cacophony-files-outside-");
  await fs.promises.writeFile(path.join(root, "inside.txt"), "needle\n");
  await fs.promises.writeFile(path.join(outside, "secret.txt"), "needle\n");
  await fs.promises.symlink(outside, path.join(root, "linked"));
  const handlers = createConfinedFileHandlers(root);

  const listing = await handlers.list_files({});
  assert.ok(listing.entries.includes("inside.txt"));
  assert.ok(listing.entries.includes("linked@"));
  assert.ok(!listing.entries.includes("linked/secret.txt"));
  const search = await handlers.search_text({ query: "needle" });
  assert.deepEqual(search.matches.map((match) => match.path), ["inside.txt"]);
});

test("evidence store exposes handlers only when evidence is declared", async (t) => {
  const root = await createDirectory(t, "cacophony-evidence-");
  await fs.promises.writeFile(path.join(root, "analysis.json"), '{"ok":true}\n');

  const empty = await createEvidenceStore(root, []);
  assert.deepEqual(empty.toolNames, []);
  const declared = await createEvidenceStore(root, ["analysis.json"]);
  assert.deepEqual(declared.toolNames, [
    "list_evidence",
    "read_evidence",
    "search_evidence",
  ]);
  await assert.rejects(
    () => declared.handlers.read_evidence({ path: "other.json" }),
    /not a declared evidence file/,
  );
});

test("tool registry filters definitions and authorizes before dispatch", async () => {
  let called = false;
  const registry = createToolRegistry({
    allowedNames: ["read_file"],
    handlers: {
      read_file() {
        called = true;
        return { content: "ok" };
      },
      get_diff() {
        throw new Error("must not run");
      },
    },
  });

  assert.deepEqual(registry.definitions.map((tool) => tool.name), ["read_file"]);
  await assert.rejects(
    () => registry.execute("get_diff"),
    /unavailable for this review target/,
  );
  assert.equal(called, false);
  assert.deepEqual(await registry.execute("read_file"), { content: "ok" });
  assert.equal(called, true);
});
