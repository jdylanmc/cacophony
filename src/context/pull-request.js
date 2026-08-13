import fs from "node:fs";

function requiredString(value, name) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Pull request event is missing ${name}`);
  }
  return value;
}

export async function loadPullRequestContext(eventPath) {
  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is required");
  }

  let event;
  try {
    event = JSON.parse(await fs.promises.readFile(eventPath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read GITHUB_EVENT_PATH: ${error.message}`);
  }

  const pullRequest = event.pull_request;
  if (!pullRequest) {
    throw new Error("Cacophony must run for a pull_request event");
  }

  return {
    pullRequest: {
      number: pullRequest.number ?? event.number,
      title: requiredString(pullRequest.title, "pull_request.title"),
      body: typeof pullRequest.body === "string" ? pullRequest.body : "",
      baseSha: requiredString(pullRequest.base?.sha, "pull_request.base.sha"),
      headSha: requiredString(pullRequest.head?.sha, "pull_request.head.sha"),
      baseRef: requiredString(pullRequest.base?.ref, "pull_request.base.ref"),
      headRef: requiredString(pullRequest.head?.ref, "pull_request.head.ref"),
      repository: requiredString(
        pullRequest.base?.repo?.full_name ?? event.repository?.full_name,
        "repository.full_name",
      ),
      author: requiredString(pullRequest.user?.login, "pull_request.user.login"),
      url: requiredString(pullRequest.html_url, "pull_request.html_url"),
      fromFork:
        pullRequest.head?.repo?.full_name !== undefined &&
        pullRequest.head.repo.full_name !== pullRequest.base?.repo?.full_name,
    },
  };
}
