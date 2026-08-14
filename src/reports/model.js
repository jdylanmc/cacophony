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
  target,
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
    reviewScope: target.kind,
    pullRequest: target.reportTarget.pullRequest,
    repository: target.reportTarget.repository,
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
  target,
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
    reviewScope: target?.kind ?? config?.reviewScope ?? "pull-request",
    pullRequest: target?.reportTarget.pullRequest ?? null,
    repository: target?.reportTarget.repository ?? null,
    startedAt,
    completedAt: new Date().toISOString(),
    execution: { turns: 0, toolCalls: 0 },
    verdict,
    maxSeverity: "none",
    summary: cause instanceof Error ? cause.message : String(cause),
    findings: [],
  };
}

export function createErrorReport({ error, config, target, startedAt }) {
  return createTerminalReport({
    status: "error",
    verdict: "error",
    cause: error,
    config,
    target,
    startedAt,
  });
}

export function createInconclusiveReport({ reason, config, target, startedAt }) {
  return createTerminalReport({
    status: "inconclusive",
    verdict: "inconclusive",
    cause: reason,
    config,
    target,
    startedAt,
  });
}
