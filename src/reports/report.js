import fs from "node:fs";
import path from "node:path";

export const SEVERITIES = ["none", "low", "medium", "high", "critical"];
export const REVIEWER_SUBMISSION_VERDICTS = ["pass", "warn", "fail"];
export const TERMINAL_VERDICTS = [
  ...REVIEWER_SUBMISSION_VERDICTS,
  "inconclusive",
  "error",
];

export function severityRank(value) {
  const rank = SEVERITIES.indexOf(value);
  if (rank === -1) {
    throw new Error(`Invalid severity: ${value}`);
  }
  return rank;
}

function requireString(value, field, { allowEmpty = false, max = 20_000 } = {}) {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${field} must be a non-empty string`);
  }
  if (value.length > max) {
    throw new Error(`${field} exceeds ${max} characters`);
  }
  return value.trim();
}

function optionalString(value, field, max = 20_000) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return requireString(value, field, { max });
}

function validateEvidence(value, findingIndex, evidenceIndex) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `findings[${findingIndex}].evidence[${evidenceIndex}] must be an object`,
    );
  }
  const line = value.line;
  if (line !== undefined && (!Number.isInteger(line) || line < 1)) {
    throw new Error(
      `findings[${findingIndex}].evidence[${evidenceIndex}].line must be a positive integer`,
    );
  }

  return {
    path: requireString(
      value.path,
      `findings[${findingIndex}].evidence[${evidenceIndex}].path`,
      { max: 1_000 },
    ),
    ...(line === undefined ? {} : { line }),
    detail: requireString(
      value.detail,
      `findings[${findingIndex}].evidence[${evidenceIndex}].detail`,
      { max: 5_000 },
    ),
  };
}

export function validateSubmission(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("submit_report arguments must be an object");
  }

  const verdict = requireString(value.verdict, "verdict", { max: 20 }).toLowerCase();
  if (!REVIEWER_SUBMISSION_VERDICTS.includes(verdict)) {
    throw new Error(
      `reviewer verdict must be one of ${REVIEWER_SUBMISSION_VERDICTS.join(", ")}`,
    );
  }

  if (!Array.isArray(value.findings)) {
    throw new Error("findings must be an array");
  }
  if (value.findings.length > 100) {
    throw new Error("findings cannot contain more than 100 items");
  }

  const findings = value.findings.map((finding, index) => {
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw new Error(`findings[${index}] must be an object`);
    }

    const severity = requireString(finding.severity, `findings[${index}].severity`, {
      max: 20,
    }).toLowerCase();
    if (!SEVERITIES.slice(1).includes(severity)) {
      throw new Error(
        `findings[${index}].severity must be one of ${SEVERITIES.slice(1).join(", ")}`,
      );
    }

    const evidence = finding.evidence ?? [];
    if (!Array.isArray(evidence) || evidence.length > 20) {
      throw new Error(`findings[${index}].evidence must be an array of at most 20 items`);
    }

    return {
      id: optionalString(finding.id, `findings[${index}].id`, 100) ?? `finding-${index + 1}`,
      severity,
      title: requireString(finding.title, `findings[${index}].title`, { max: 500 }),
      explanation: requireString(
        finding.explanation,
        `findings[${index}].explanation`,
        { max: 20_000 },
      ),
      recommendation: requireString(
        finding.recommendation,
        `findings[${index}].recommendation`,
        { max: 20_000 },
      ),
      evidence: evidence.map((item, evidenceIndex) =>
        validateEvidence(item, index, evidenceIndex),
      ),
    };
  });

  const maxSeverity = findings.reduce(
    (maximum, finding) =>
      severityRank(finding.severity) > severityRank(maximum)
        ? finding.severity
        : maximum,
    "none",
  );

  const canonicalVerdict =
    maxSeverity === "none"
      ? "pass"
      : severityRank(maxSeverity) >= severityRank("high")
        ? "fail"
        : "warn";

  return {
    verdict: canonicalVerdict,
    maxSeverity,
    summary: requireString(value.summary, "summary", { max: 20_000 }),
    ...(optionalString(value.limitations, "limitations", 20_000)
      ? { limitations: optionalString(value.limitations, "limitations", 20_000) }
      : {}),
    findings,
  };
}

export function createCompletedReport({
  submission,
  config,
  context,
  startedAt,
  turns,
  toolCalls,
}) {
  return {
    schemaVersion: "1.0",
    status: "completed",
    agent: {
      id: config.agentId,
      promptFile: config.promptFile,
    },
    provider: {
      name: config.provider,
      deployment: config.deployment,
    },
    pullRequest: context.pullRequest,
    startedAt,
    completedAt: new Date().toISOString(),
    execution: { turns, toolCalls },
    ...submission,
  };
}

function createTerminalReport({
  status,
  verdict,
  cause,
  config,
  context,
  startedAt,
}) {
  if (!TERMINAL_VERDICTS.includes(verdict)) {
    throw new Error(`terminal verdict must be one of ${TERMINAL_VERDICTS.join(", ")}`);
  }

  return {
    schemaVersion: "1.0",
    status,
    agent: {
      id: config?.agentId ?? "cacophony",
      promptFile: config?.promptFile ?? null,
    },
    provider: {
      name: config?.provider ?? "unknown",
      deployment: config?.deployment ?? "unknown",
    },
    pullRequest: context?.pullRequest ?? null,
    startedAt,
    completedAt: new Date().toISOString(),
    execution: { turns: 0, toolCalls: 0 },
    verdict,
    maxSeverity: "none",
    summary: cause instanceof Error ? cause.message : String(cause),
    findings: [],
  };
}

export function createErrorReport({ error, config, context, startedAt }) {
  return createTerminalReport({
    status: "error",
    verdict: "error",
    cause: error,
    config,
    context,
    startedAt,
  });
}

export function createInconclusiveReport({ reason, config, context, startedAt }) {
  return createTerminalReport({
    status: "inconclusive",
    verdict: "inconclusive",
    cause: reason,
    config,
    context,
    startedAt,
  });
}

function escapeMarkdown(value) {
  return String(value).replaceAll("|", "\\|");
}

export function renderMarkdown(report) {
  const lines = [
    `# Cacophony: ${report.agent.id}`,
    "",
    `**Status:** ${report.status}`,
    `**Verdict:** ${report.verdict}`,
    `**Maximum severity:** ${report.maxSeverity}`,
    "",
    "## Summary",
    "",
    report.summary,
  ];

  if (report.limitations) {
    lines.push("", "## Limitations", "", report.limitations);
  }

  lines.push("", "## Findings", "");
  if (report.findings.length === 0) {
    lines.push("No findings.");
  } else {
    for (const finding of report.findings) {
      lines.push(
        `### ${finding.id}: ${finding.title}`,
        "",
        `**Severity:** ${finding.severity}`,
        "",
        finding.explanation,
        "",
        `**Recommendation:** ${finding.recommendation}`,
      );
      if (finding.evidence.length > 0) {
        lines.push("", "| Location | Evidence |", "| --- | --- |");
        for (const evidence of finding.evidence) {
          const location = `${evidence.path}${evidence.line ? `:${evidence.line}` : ""}`;
          lines.push(
            `| ${escapeMarkdown(location)} | ${escapeMarkdown(evidence.detail)} |`,
          );
        }
      }
      lines.push("");
    }
  }

  lines.push(
    "---",
    `Provider: ${report.provider.name} / ${report.provider.deployment}`,
    `Turns: ${report.execution.turns}; tool calls: ${report.execution.toolCalls}`,
    "",
  );
  return lines.join("\n");
}

async function atomicWrite(filePath, content) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
}

export async function writeReports(report, workspace, outputDirectory) {
  const root = await fs.promises.realpath(workspace);
  const directory = path.resolve(root, outputDirectory, report.agent.id);
  if (!directory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report output directory must be inside the workspace");
  }

  let existingAncestor = directory;
  while (true) {
    try {
      await fs.promises.lstat(existingAncestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        throw new Error("Unable to resolve report output directory");
      }
      existingAncestor = parent;
    }
  }
  const realAncestor = await fs.promises.realpath(existingAncestor);
  if (realAncestor !== root && !realAncestor.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report output directory resolves outside the workspace");
  }

  await fs.promises.mkdir(directory, { recursive: true });
  const realDirectory = await fs.promises.realpath(directory);
  if (!realDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report output directory resolves outside the workspace");
  }
  const jsonPath = path.join(realDirectory, "report.json");
  const markdownPath = path.join(realDirectory, "report.md");
  await atomicWrite(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(markdownPath, renderMarkdown(report));
  return {
    jsonPath,
    markdownPath,
    jsonRelative: path.relative(root, jsonPath),
    markdownRelative: path.relative(root, markdownPath),
  };
}
