import test from "node:test";
import assert from "node:assert/strict";

import { shouldFail } from "../../src/policy/policy.js";

test("policy maps severity thresholds and always fails framework errors", () => {
  const report = { status: "completed", verdict: "fail", maxSeverity: "high" };
  assert.equal(shouldFail(report, "high"), true);
  assert.equal(shouldFail(report, "critical"), false);
  assert.equal(shouldFail(report, "never"), false);
  assert.equal(
    shouldFail({ status: "error", verdict: "error", maxSeverity: "none" }, "never"),
    true,
  );
  assert.equal(
    shouldFail(
      {
        status: "inconclusive",
        verdict: "inconclusive",
        maxSeverity: "none",
      },
      "low",
    ),
    true,
  );
});
