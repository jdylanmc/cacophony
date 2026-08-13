import path from "node:path";

import { loadPullRequestContext } from "./context/pull-request.js";
import { error as logError, info, setOutputs } from "./github.js";
import { readInputs } from "./inputs.js";
import { shouldFail } from "./policy/policy.js";
import { createAzureFoundryProvider } from "./providers/azure-foundry.js";
import { createErrorReport, writeReports } from "./reports/report.js";
import { runReview } from "./runner/review.js";

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
  const workspace = path.resolve(process.env.GITHUB_WORKSPACE || process.cwd());
  const apiKey = process.env.CACOPHONY_AZURE_API_KEY || "";
  let config;
  let context;
  let report;

  try {
    config = readInputs();
    context = await loadPullRequestContext(process.env.GITHUB_EVENT_PATH);
    const provider = createAzureFoundryProvider({
      endpoint: config.endpoint,
      deployment: config.deployment,
      apiKey,
    });
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(new Error("Cacophony review timed out")),
      config.timeoutSeconds * 1_000,
    );
    try {
      report = await runReview({
        config,
        context,
        workspace,
        provider,
        signal: controller.signal,
        startedAt,
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (caught) {
    const message = sanitize(
      caught instanceof Error ? caught.message : String(caught),
      [apiKey],
    );
    report = createErrorReport({
      error: new Error(message),
      config,
      context,
      startedAt,
    });
  }

  const outputDirectory = config?.outputDirectory ?? ".cacophony/out";
  const paths = await writeReports(report, workspace, outputDirectory);
  await setOutputs({
    verdict: report.verdict,
    "max-severity": report.maxSeverity,
    "report-json": paths.jsonRelative,
    "report-markdown": paths.markdownRelative,
    "agent-id": report.agent.id,
  });

  info(`Cacophony wrote ${paths.jsonRelative} and ${paths.markdownRelative}`);
  if (shouldFail(report, config?.failOn ?? "high")) {
    logError(
      report.status === "error"
        ? `Cacophony failed: ${report.summary}`
        : `Cacophony found ${report.maxSeverity} severity issues`,
    );
    process.exitCode = 1;
  }
}

await main();
