# Step 4A: Add an agent inside Cacophony

Create:

```text
.cacophony/agents/<slug>.md
examples/reviewers/<slug>.md
.github/workflows/<slug>.yml
```

The active and sample prompts must be byte-for-byte identical.

Copy an established persona workflow and preserve:

- trusted `pull_request_target` trigger;
- same-repository guard;
- `contents: read`;
- every remote `uses:` dependency pinned to a reviewed full commit SHA;
- Checkout head checkout for read-only inspection;
- trust-boundary comment stating prompts load from `pull_request.base.sha`;
- base-prompt availability check;
- pinned full Cacophony commit SHA;
- `max-turns: 16`;
- `timeout-seconds: 600`;
- `rate-limit-retries: 2`;
- API key only on the pinned Cacophony step;
- artifact upload skipped when the reviewer did not run.

Add:

- a README catalog entry;
- a test asserting active/sample equality;
- tests for block marker, approval marker, prompt path, action pin, budget, and
  artifact name.

Create one persona per branch and pull request. A new workflow does not review
its own introduction because it is not yet trusted on the base branch.
