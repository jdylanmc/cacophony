import fs from "node:fs";
import path from "node:path";

import { runGit } from "./git-operations.js";
import { MAX_FILE_BYTES } from "./repository-limits.js";
import {
  assertRelativePath,
  assertSha,
  ensureInside,
} from "./path-policy.js";

export async function readPrompt(workspace, promptFile, trustedSha) {
  const root = await fs.promises.realpath(workspace);
  assertSha(trustedSha, "trusted prompt SHA");
  const normalized = assertRelativePath(promptFile).split(path.sep).join("/");
  const result = await runGit(
    root,
    ["show", `${trustedSha}:${normalized}`],
    MAX_FILE_BYTES,
  );
  if (result.truncated) {
    throw new Error(`Prompt must be no larger than ${MAX_FILE_BYTES} bytes`);
  }
  return result.content;
}

export async function readActionPrompt(actionPath, promptFile) {
  const root = await fs.promises.realpath(actionPath);
  const file = await ensureInside(root, promptFile);
  const stat = await fs.promises.stat(file);
  if (!stat.isFile()) {
    throw new Error("prompt-file is not a file");
  }
  if (stat.size > MAX_FILE_BYTES) {
    throw new Error(`Prompt must be no larger than ${MAX_FILE_BYTES} bytes`);
  }
  const content = await fs.promises.readFile(file, "utf8");
  if (content.includes("\0")) {
    throw new Error("prompt-file must be text");
  }
  return content;
}
