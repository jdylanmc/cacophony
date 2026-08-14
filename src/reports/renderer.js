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
  ];

  if (report.reviewScope === "repository" && report.repository) {
    lines.push(
      `**Repository:** ${report.repository.name}`,
      `**Commit:** ${report.repository.sha}`,
    );
  } else if (report.pullRequest) {
    lines.push(`**Pull request:** #${report.pullRequest.number}`);
  }

  lines.push("", "## Summary", "", report.summary);

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
