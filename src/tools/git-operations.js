import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { MAX_DIFF_BYTES } from "./repository-limits.js";
import { assertRelativePath, assertSha } from "./path-policy.js";

const execFileAsync = promisify(execFile);

function truncate(value, maximum) {
  if (Buffer.byteLength(value, "utf8") <= maximum) {
    return { content: value, truncated: false };
  }
  return {
    content: `${Buffer.from(value).subarray(0, maximum).toString("utf8")}\n[truncated]`,
    truncated: true,
  };
}

export async function runGit(workspace, args, maximum = MAX_DIFF_BYTES) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspace, ...args], {
      encoding: "utf8",
      maxBuffer: maximum + 1_000_000,
      timeout: 30_000,
      windowsHide: true,
    });
    return truncate(stdout, maximum);
  } catch (error) {
    const detail = String(error.stderr || error.message).trim();
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

export async function attestCheckout(root, toolScope) {
  const { pullRequest, expectedRepositorySha } = toolScope;
  if (pullRequest) {
    assertSha(pullRequest.baseSha, "pull_request.base.sha");
    assertSha(pullRequest.headSha, "pull_request.head.sha");
    return;
  }

  assertSha(expectedRepositorySha, "repository.sha");
  const checkedOut = await runGit(root, ["rev-parse", "HEAD"], 100);
  if (checkedOut.content.trim() !== expectedRepositorySha) {
    throw new Error("repository audit checkout does not match GITHUB_SHA");
  }
}

export function createGitHandlers(root, pullRequest) {
  const baseSha = pullRequest?.baseSha;
  const headSha = pullRequest?.headSha;
  return {
    get_pull_request() {
      if (!pullRequest) {
        throw new Error("get_pull_request is unavailable for repository audits");
      }
      return pullRequest;
    },

    list_changed_files() {
      if (!pullRequest) {
        throw new Error("list_changed_files is unavailable for repository audits");
      }
      return runGit(root, [
        "diff",
        "--name-status",
        "--find-renames",
        `${baseSha}...${headSha}`,
        "--",
      ]);
    },

    get_diff(args) {
      if (!pullRequest) {
        throw new Error("get_diff is unavailable for repository audits");
      }
      const command = [
        "diff",
        "--no-ext-diff",
        "--find-renames",
        "--unified=3",
        `${baseSha}...${headSha}`,
        "--",
      ];
      if (args.path !== undefined) {
        command.push(assertRelativePath(args.path));
      }
      return runGit(root, command);
    },
  };
}
