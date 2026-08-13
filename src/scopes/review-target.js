import { loadPullRequestContext } from "../context/pull-request.js";
import { loadRepositoryContext } from "../context/repository.js";

const FILE_TOOLS = ["read_file", "list_files", "search_text", "submit_report"];
const PULL_REQUEST_TOOLS = [
  "get_pull_request",
  "list_changed_files",
  "get_diff",
  ...FILE_TOOLS,
];

function pullRequestTarget(context) {
  const pullRequest = context.pullRequest;
  return {
    kind: "pull-request",
    context,
    trustedPromptSha: pullRequest.baseSha,
    allowedToolNames: PULL_REQUEST_TOOLS,
    scopeInstructions: "Use the supplied read-only tools to inspect the pull request.",
    reportTarget: {
      pullRequest,
      repository: null,
    },
    async buildInitialInput(tools) {
      const changedFiles = await tools.execute("list_changed_files", {});
      return `Review pull request #${pullRequest.number}: ${pullRequest.title}
Repository: ${pullRequest.repository}
Author: ${pullRequest.author}
Base: ${pullRequest.baseRef} (${pullRequest.baseSha})
Head: ${pullRequest.headRef} (${pullRequest.headSha})

Pull request body:
<pull_request_body>
${pullRequest.body}
</pull_request_body>

Changed files:
<changed_files>
${changedFiles.content}
</changed_files>`;
    },
  };
}

function repositoryTarget(context) {
  const repository = context.repository;
  return {
    kind: "repository",
    context,
    trustedPromptSha: repository.sha,
    allowedToolNames: FILE_TOOLS,
    scopeInstructions: `Perform a repository-wide audit. There is no pull request or changed-file list.
Systematically inspect the full repository using list_files, search_text, and read_file.
Interpret review-lens references to a pull request or diff as instructions to inspect
the corresponding behavior across the entire repository.`,
    reportTarget: {
      pullRequest: null,
      repository,
    },
    async buildInitialInput(tools) {
      const files = await tools.execute("list_files", {});
      return `Audit the complete repository at this trusted commit.
Repository: ${repository.name}
Ref: ${repository.ref}
Commit: ${repository.sha}
Requested by: ${repository.actor}

Repository files:
<repository_files>
${files.entries.join("\n")}
</repository_files>

The file listing may be truncated. Use list_files on subdirectories, search_text,
and read_file to inspect the repository systematically before submitting.`;
    },
  };
}

export async function createReviewTarget({
  reviewScope,
  eventPath,
  env = process.env,
}) {
  if (reviewScope === "pull-request") {
    return pullRequestTarget(await loadPullRequestContext(eventPath));
  }
  if (reviewScope === "repository") {
    return repositoryTarget(loadRepositoryContext(env));
  }
  throw new Error(`Unsupported review scope: ${reviewScope}`);
}
