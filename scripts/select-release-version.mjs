import fs from "node:fs";
import { pathToFileURL } from "node:url";

const SEMVER_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(value, label) {
  const match = SEMVER_PATTERN.exec(value.trim());
  if (!match) {
    throw new Error(`${label} must be a stable semantic version.`);
  }

  const version = {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
  if (Object.values(version).some((part) => !Number.isSafeInteger(part))) {
    throw new Error(`${label} contains an unsafe numeric component.`);
  }
  return version;
}

function compareVersions(left, right) {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

function formatVersion(version) {
  return `${version.major}.${version.minor}.${version.patch}`;
}

function formatSelection(version) {
  return {
    tag: `v${formatVersion(version)}`,
    majorTag: `v${version.major}`,
    minorTag: `v${version.major}.${version.minor}`,
  };
}

export function selectReleaseVersion(
  baseVersion,
  releaseTags = [],
  currentReleaseTags = [],
) {
  const base = parseVersion(baseVersion, "BASE_VERSION");
  const current = currentReleaseTags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => parseVersion(tag, `Current release tag ${tag}`))
    .sort(compareVersions)
    .at(-1);
  if (current) {
    return formatSelection(current);
  }

  const published = releaseTags
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => parseVersion(tag, `Release tag ${tag}`))
    .sort(compareVersions);

  const latest = published.at(-1);
  const selected =
    !latest || compareVersions(latest, base) < 0
      ? base
      : { ...latest, patch: latest.patch + 1 };

  if (!Number.isSafeInteger(selected.patch)) {
    throw new Error("The next patch version exceeds JavaScript's safe integer range.");
  }

  return formatSelection(selected);
}

function runCli() {
  const selection = selectReleaseVersion(
    process.env.BASE_VERSION ?? "",
    (process.env.RELEASE_TAGS ?? "").split("\n"),
    (process.env.CURRENT_RELEASE_TAGS ?? "").split("\n"),
  );
  const output = [
    `tag=${selection.tag}`,
    `major-tag=${selection.majorTag}`,
    `minor-tag=${selection.minorTag}`,
  ].join("\n");

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${output}\n`);
  } else {
    process.stdout.write(`${output}\n`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
