import test from "node:test";
import assert from "node:assert/strict";

import { loadRepositoryContext } from "../../src/context/repository.js";

test("loadRepositoryContext derives a trusted repository audit target", () => {
  assert.deepEqual(
    loadRepositoryContext({
      GITHUB_REPOSITORY: "example/repository",
      GITHUB_SHA: "a".repeat(40),
      GITHUB_REF_NAME: "main",
      GITHUB_ACTOR: "octocat",
      GITHUB_SERVER_URL: "https://github.example",
    }),
    {
      repository: {
        name: "example/repository",
        sha: "a".repeat(40),
        ref: "main",
        actor: "octocat",
        url: "https://github.example/example/repository",
      },
    },
  );
});

test("loadRepositoryContext rejects incomplete or untrusted commit metadata", () => {
  const base = {
    GITHUB_REPOSITORY: "example/repository",
    GITHUB_SHA: "a".repeat(40),
    GITHUB_REF_NAME: "main",
    GITHUB_ACTOR: "octocat",
  };
  assert.throws(
    () => loadRepositoryContext({ ...base, GITHUB_REPOSITORY: "" }),
    /GITHUB_REPOSITORY/,
  );
  assert.throws(
    () => loadRepositoryContext({ ...base, GITHUB_SHA: "main" }),
    /full Git commit SHA/,
  );
});
