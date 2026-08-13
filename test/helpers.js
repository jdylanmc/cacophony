import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function git(directory, ...args) {
  return execFileAsync("git", ["-C", directory, ...args], { encoding: "utf8" });
}

export async function createPullRequestFixture() {
  const workspace = await fs.promises.mkdtemp(path.join(os.tmpdir(), "cacophony-test-"));
  await git(workspace, "init", "-b", "main");
  await git(workspace, "config", "user.email", "cacophony@example.invalid");
  await git(workspace, "config", "user.name", "Cacophony Tests");

  await fs.promises.mkdir(path.join(workspace, ".cacophony", "agents"), {
    recursive: true,
  });
  await fs.promises.writeFile(
    path.join(workspace, ".cacophony", "agents", "reviewer.md"),
    "Look for correctness defects and cite exact evidence.\n",
  );
  await fs.promises.writeFile(
    path.join(workspace, "app.js"),
    "export function add(a, b) {\n  return a + b;\n}\n",
  );
  await git(workspace, "add", ".");
  await git(workspace, "commit", "-m", "base");
  const { stdout: baseOutput } = await git(workspace, "rev-parse", "HEAD");
  const baseSha = baseOutput.trim();

  await fs.promises.writeFile(
    path.join(workspace, "app.js"),
    "export function add(a, b) {\n  return a - b;\n}\n",
  );
  await fs.promises.writeFile(path.join(workspace, "new.txt"), "new file\n");
  await git(workspace, "add", ".");
  await git(workspace, "commit", "-m", "head");
  const { stdout: headOutput } = await git(workspace, "rev-parse", "HEAD");
  const headSha = headOutput.trim();

  const event = {
    number: 7,
    repository: { full_name: "example/repository" },
    pull_request: {
      number: 7,
      title: "Change addition",
      body: "Please review this change.",
      html_url: "https://github.com/example/repository/pull/7",
      user: { login: "octocat" },
      base: {
        sha: baseSha,
        ref: "main",
        repo: { full_name: "example/repository" },
      },
      head: {
        sha: headSha,
        ref: "feature",
        repo: { full_name: "example/repository" },
      },
    },
  };
  const eventPath = path.join(workspace, "event.json");
  await fs.promises.writeFile(eventPath, JSON.stringify(event));

  return {
    workspace,
    event,
    eventPath,
    context: {
      pullRequest: {
        number: 7,
        title: "Change addition",
        body: "Please review this change.",
        baseSha,
        headSha,
        baseRef: "main",
        headRef: "feature",
        repository: "example/repository",
        author: "octocat",
        url: "https://github.com/example/repository/pull/7",
        fromFork: false,
      },
    },
    baseSha,
    headSha,
  };
}

export async function removeFixture(fixture) {
  await fs.promises.rm(fixture.workspace, { recursive: true, force: true });
}
