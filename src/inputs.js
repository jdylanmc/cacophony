import path from "node:path";

import { SEVERITIES } from "./reports/report.js";

function getInput(name, env = process.env) {
  return (
    env[`INPUT_${name.toUpperCase()}`] ??
    env[`INPUT_${name.replaceAll("-", "_").toUpperCase()}`] ??
    ""
  ).trim();
}

function required(name, env) {
  const value = getInput(name, env);
  if (!value) {
    throw new Error(`Missing required input: ${name}`);
  }
  return value;
}

function boundedInteger(name, fallback, minimum, maximum, env) {
  const raw = getInput(name, env) || String(fallback);
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be an integer`);
  }

  const value = Number(raw);
  if (value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function relativePath(name, value) {
  if (!value || path.isAbsolute(value)) {
    throw new Error(`${name} must be a repository-relative path`);
  }

  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${name} cannot leave the repository`);
  }
  return normalized;
}

function relativePaths(name, value) {
  const paths = value
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => relativePath(name, entry));
  if (paths.length > 20) {
    throw new Error(`${name} cannot contain more than 20 paths`);
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error(`${name} cannot contain duplicate paths`);
  }
  return paths;
}

export function normalizeAgentId(promptFile) {
  const stem = path.basename(promptFile, path.extname(promptFile));
  const id = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!id) {
    throw new Error("prompt-file must produce a non-empty agent identifier");
  }
  return id;
}

export function readInputs(env = process.env) {
  const promptFile = relativePath("prompt-file", required("prompt-file", env));
  const cacophonyRoot = `.cacophony${path.sep}`;
  if (promptFile !== ".cacophony" && !promptFile.startsWith(cacophonyRoot)) {
    throw new Error("prompt-file must be under .cacophony/");
  }
  if (path.extname(promptFile).toLowerCase() !== ".md") {
    throw new Error("prompt-file must be a Markdown file");
  }

  const provider = getInput("provider", env) || "azure-foundry";
  if (provider !== "azure-foundry") {
    throw new Error(`Unsupported provider: ${provider}`);
  }

  const failOn = (getInput("fail-on", env) || "high").toLowerCase();
  const findingSeverities = SEVERITIES.slice(1);
  if (failOn !== "never" && !findingSeverities.includes(failOn)) {
    throw new Error(
      `fail-on must be one of ${findingSeverities.join(", ")}, or never`,
    );
  }

  const reviewScope = (getInput("review-scope", env) || "pull-request").toLowerCase();
  if (!["pull-request", "repository"].includes(reviewScope)) {
    throw new Error("review-scope must be pull-request or repository");
  }

  return {
    promptFile,
    agentId: normalizeAgentId(promptFile),
    provider,
    endpoint: required("endpoint", env),
    deployment: required("deployment", env),
    maxTurns: boundedInteger("max-turns", 8, 1, 20, env),
    timeoutSeconds: boundedInteger("timeout-seconds", 300, 30, 1800, env),
    rateLimitRetries: boundedInteger("rate-limit-retries", 2, 0, 10, env),
    failOn,
    reviewScope,
    workspaceDirectory: relativePath(
      "workspace-directory",
      getInput("workspace-directory", env) || ".",
    ),
    evidenceFiles: relativePaths("evidence-files", getInput("evidence-files", env)),
    outputDirectory: relativePath(
      "output-directory",
      getInput("output-directory", env) || ".cacophony/out",
    ),
  };
}
