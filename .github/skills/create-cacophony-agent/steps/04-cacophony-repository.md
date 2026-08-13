# Step 4A: Add an agent inside Cacophony

Create:

```text
.cacophony/agents/<slug>.md
.github/workflows/<slug>.yml
```

The active prompt is the sole reviewer-contract source. Link the README catalog
entry to `.cacophony/agents/<slug>.md`; do not create a second prompt copy.

Create a thin caller of `.github/workflows/cacophony-review.yml`. Keep shared
authorization, checkout, prompt availability, action invocation, secret
scoping, and artifact logic exclusively in that reusable workflow.

The caller preserves:

- trusted `pull_request_target` trigger;
- `contents: read`;
- local `uses: ./.github/workflows/cacophony-review.yml`;
- the selected model deployment hardcoded in the workflow;
- `max-turns: 20`;
- `timeout-seconds: 600`;
- `rate-limit-retries: 2`, meaning two retries after the initial request, for
  three total attempts;
- API key passed only through the reusable workflow's declared secret;
- no caller-supplied event identity or pull-request security context; the
  reusable worker reads those authoritative values from the inherited GitHub
  event;
- per-pull-request concurrency with superseded runs canceled;
- one narrow agent slug plus its review settings.

The trusted-base pattern may review authorized fork pull requests because it
never executes head-controlled code. That code trust boundary does not by
itself authorize arbitrary fork authors to spend provider quota. The caller
owns `pull_request_target`, read-only permissions, and concurrency. The reusable
workflow rejects other events, accepts same-repository pull requests, and
accepts a fork only for an `OWNER`, `MEMBER`, or `COLLABORATOR` author before
checkout.

Add:

- a README catalog entry;
- a test asserting the catalog entry resolves to the canonical prompt;
- tests for block marker, approval marker, prompt path, action pin, budget, and
  artifact name.

Create one persona per branch and pull request. A new workflow does not review
its own introduction because it is not yet trusted on the base branch.
