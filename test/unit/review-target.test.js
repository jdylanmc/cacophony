import test from "node:test";
import assert from "node:assert/strict";

import { createReviewTarget } from "../../src/scopes/review-target.js";
import {
  createPullRequestFixture,
  removeFixture,
} from "../helpers.js";

test("review targets provide one complete scope contract", async (t) => {
  const fixture = await createPullRequestFixture();
  t.after(() => removeFixture(fixture));

  const pullRequest = await createReviewTarget({
    reviewScope: "pull-request",
    eventPath: fixture.eventPath,
  });
  const repository = await createReviewTarget({
    reviewScope: "repository",
    env: {
      GITHUB_REPOSITORY: "example/repository",
      GITHUB_SHA: fixture.headSha,
      GITHUB_REF_NAME: "main",
      GITHUB_ACTOR: "octocat",
    },
  });

  for (const target of [pullRequest, repository]) {
    assert.match(target.kind, /^(pull-request|repository)$/);
    assert.ok(["git", "action"].includes(target.promptSource.kind));
    assert.ok(target.toolScope.allowedNames.includes("read_file"));
    assert.ok(target.toolScope.allowedNames.includes("submit_report"));
    assert.equal(typeof target.scopeInstructions, "string");
    assert.equal(typeof target.buildInitialInput, "function");
    assert.ok(target.reportTarget);
  }

  assert.match(pullRequest.promptSource.sha, /^[a-f0-9]{40}$/);
  assert.ok(pullRequest.toolScope.allowedNames.includes("get_diff"));
  assert.equal(pullRequest.toolScope.pullRequest.number, 7);
  assert.equal(pullRequest.reportTarget.repository, null);
  assert.equal(repository.promptSource.kind, "action");
  assert.equal(repository.toolScope.allowedNames.includes("get_diff"), false);
  assert.match(repository.toolScope.expectedRepositorySha, /^[a-f0-9]{40}$/);
  assert.equal(repository.reportTarget.pullRequest, null);
});

test("review target factory rejects unknown scopes", async () => {
  await assert.rejects(
    () => createReviewTarget({ reviewScope: "workspace" }),
    /Unsupported review scope/,
  );
});
