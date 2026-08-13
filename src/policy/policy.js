import { severityRank } from "../reports/report.js";

export function shouldFail(report, failOn) {
  if (report.status === "inconclusive" || report.verdict === "inconclusive") {
    return false;
  }
  if (report.status === "error" || report.verdict === "error") {
    return true;
  }
  if (failOn === "never") {
    return false;
  }
  return severityRank(report.maxSeverity) >= severityRank(failOn);
}
