function requiredString(value, name) {
  if (typeof value !== "string" || !value) {
    throw new Error(`Repository audit is missing ${name}`);
  }
  return value;
}

export function loadRepositoryContext(env = process.env) {
  const repository = requiredString(env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const sha = requiredString(env.GITHUB_SHA, "GITHUB_SHA");
  if (!/^[a-f0-9]{40}$/i.test(sha)) {
    throw new Error("GITHUB_SHA must be a full Git commit SHA");
  }

  return {
    repository: {
      name: repository,
      sha,
      ref: requiredString(
        env.GITHUB_REF_NAME || env.GITHUB_REF,
        "GITHUB_REF_NAME",
      ),
      actor: requiredString(env.GITHUB_ACTOR, "GITHUB_ACTOR"),
      url: `${env.GITHUB_SERVER_URL || "https://github.com"}/${repository}`,
    },
  };
}
