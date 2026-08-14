import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  appendStepSummary,
  error as logError,
  info,
  setOutputs,
  warning,
} from "./github.js";
import { readInputs } from "./inputs.js";
import { shouldFail } from "./policy/policy.js";
import {
  createAzureFoundryProvider,
} from "./providers/azure-foundry.js";
import { ProviderUnavailableError } from "./providers/errors.js";
import {
  createErrorReport,
  createInconclusiveReport,
} from "./reports/model.js";
import { resolveReportDirectory } from "./reports/path-policy.js";
import { renderMarkdown } from "./reports/renderer.js";
import { writeReports } from "./reports/writer.js";
import { runReview } from "./runner/review.js";
import { createReviewTarget } from "./scopes/review-target.js";

function sanitize(message, secrets) {
  let value = String(message);
  for (const secret of secrets) {
    if (secret) {
      value = value.replaceAll(secret, "***");
    }
  }
  return value;
}

async function main() {
  const startedAt = new Date().toISOString();
  const workspaceRoot = await fs.promises.realpath(
    path.resolve(process.env.GITHUB_WORKSPACE || process.cwd()),
  );
  const actionPath = await fs.promises.realpath(
    path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const apiKey = process.env.CACOPHONY_AZURE_API_KEY || "";
  let config;
  let target;
  let report;
  let workspace = workspaceRoot;

  try {
    config = readInputs();
    const candidate = path.resolve(workspaceRoot, config.workspaceDirectory);
    const resolvedWorkspace = await fs.promises.realpath(candidate);
    const workspacePrefix = `${workspaceRoot}${path.sep}`;
    if (
      resolvedWorkspace !== workspaceRoot &&
      !resolvedWorkspace.startsWith(workspacePrefix)
    ) {
      throw new Error("workspace-directory cannot leave GITHUB_WORKSPACE");
    }
    workspace = resolvedWorkspace;
    target = await createReviewTarget({
      reviewScope: config.reviewScope,
      eventPath: process.env.GITHUB_EVENT_PATH,
    });
    const provider = createAzureFoundryProvider({
      endpoint: config.endpoint,
      deployment: config.deployment,
      apiKey,
      rateLimitRetries: config.rateLimitRetries,
    });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Cacophony review timed out")),
      config.timeoutSeconds * 1_000,
    );
    try {
      report = await runReview({
        config,
        target,
        workspace,
        actionPath,
        provider,
        signal: controller.signal,
        startedAt,
        onWarning: warning,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (caught) {
    const message = sanitize(
      caught instanceof Error ? caught.message : String(caught),
      [apiKey],
    );
    report =
      caught instanceof ProviderUnavailableError
        ? createInconclusiveReport({
            reason: new Error(
              caught.reason === "rate_limit"
                ? `${caught.provider} rate limit exceeded (${caught.status}); review is inconclusive`
                : `${message}; review is inconclusive`,
            ),
            config,
            target,
            startedAt,
          })
        : createErrorReport({
            error: new Error(message),
            config,
            target,
            startedAt,
          });
  }

  const outputDirectory = config?.outputDirectory ?? ".cacophony/out";
  const markdown = renderMarkdown(report);
  const reportDirectory = await resolveReportDirectory(
    workspace,
    outputDirectory,
    report.agent.id,
  );
  const paths = await writeReports(report, markdown, reportDirectory);
  const jsonRelative = path.relative(workspace, paths.jsonPath);
  const markdownRelative = path.relative(workspace, paths.markdownPath);
  await appendStepSummary(markdown);
  await setOutputs({
    verdict: report.verdict,
    "max-severity": report.maxSeverity,
    "report-json": jsonRelative,
    "report-markdown": markdownRelative,
    "agent-id": report.agent.id,
  });

  info(`Cacophony wrote ${jsonRelative} and ${markdownRelative}`);
  if (report.status === "inconclusive") {
    warning(`Cacophony review inconclusive: ${report.summary}`);
  }
  if (shouldFail(report, config?.failOn ?? "high")) {
    logError(
      report.status === "error"
        ? `Cacophony failed: ${report.summary}`
        : report.status === "inconclusive"
          ? `Cacophony review inconclusive: ${report.summary}`
          : `Cacophony found ${report.maxSeverity} severity issues: ${report.summary}`,
    );
    process.exitCode = 1;
  }
}

await main();
