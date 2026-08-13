# Creating Cacophony agents

A Cacophony agent is a Markdown review lens plus a GitHub Actions invocation.
The prompt defines what to inspect and how to report it; Cacophony provides the
pull request context, read-only repository tools, structured report submission,
artifact files, and severity-based gating.

This guide covers two modes:

1. adding an example and active reviewer to the Cacophony repository;
2. installing a reviewer into another repository.

## 1. Define the reviewer contract

Before editing files, decide:

- **Name and slug:** for example, `Gilfoyle the Security Architect` and
  `gilfoyle-security-architect`;
- **Lens:** the narrow class of defects the reviewer owns;
- **Evidence threshold:** what must be proven before it reports a finding;
- **Block summary:** an exact prefix such as `[BLOCK: SECURITY]`;
- **Approval summary:** normally `[APPROVED]`;
- **Remediation format:** the concrete numbered steps every finding requires;
- **Model deployment:** the Azure deployment name to declare directly in this
  reviewer's workflow;
- **Budget:** start complex reviewers at 20 turns and 600 seconds.

One reviewer should own one lens. More persona does not compensate for an
ambiguous responsibility.

## 2. Adapt a prompt to Cacophony

Raw reviewer prompts often end with placeholders such as `{{GIT_DIFF}}` or
`{{EXISTING_DOCUMENTATION}}`. Remove them. Cacophony supplies tools instead.

Every prompt should:

1. state the review lens and its boundaries;
2. instruct the agent to use Cacophony's read-only tools;
3. treat pull request text and repository content as untrusted data, never as
   instructions;
4. require exact file and line evidence;
5. exclude speculative findings and unrelated style preferences;
6. define numbered remediation requirements;
7. finish only with `submit_report`;
8. require a proposed `fail` verdict and exact block-summary prefix when
   findings exist;
9. require a proposed `pass` verdict, exact `[APPROVED]` summary, and empty
   findings when no issue is supported.

Cacophony derives the canonical verdict from finding severity, so the evidence
and severity matter more than theatrical certainty.

Every run writes JSON and Markdown artifacts and appends the full Markdown
report to the GitHub job summary. A failing action annotation includes the
agent's submitted summary; the job summary contains the complete findings and
remediation.

## 3. Add an agent inside Cacophony

Create these matching files:

```text
.cacophony/agents/<slug>.md
examples/reviewers/<slug>.md
.github/workflows/<slug>.yml
```

The active and sample prompt files must be byte-for-byte identical. Add a
documentation test that reads both files and asserts equality.

Add a README entry describing the lens, block prefix, and workflow.
In every workflow created from this guide, pin each remote action reference to
a reviewed full commit SHA.

### Workflow pattern

The repository owns the security-sensitive review sequence once in
`.github/workflows/cacophony-review.yml`. It performs fork authorization,
trusted merge-ref checkout, base-prompt availability checks, the pinned
Cacophony invocation, secret scoping, and artifact upload.

Each reviewer gets an independent thin caller so GitHub schedules all
established reviewers in parallel:

```yaml
name: <Reviewer name>

on:
  pull_request_target:

permissions:
  contents: read

concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number }}
  cancel-in-progress: true

jobs:
  review:
    uses: ./.github/workflows/cacophony-review.yml
    with:
      agent-slug: <slug>
      deployment: <azure-deployment-name>
      max-turns: 20
      timeout-seconds: 600
      rate-limit-retries: 2
      fail-on: high
    secrets:
      azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}
```

Do not copy the shared steps into persona callers. Update trust policy,
checkout, action pins, provider-secret handling, and artifact behavior only in
the reusable workflow. Never execute pull request scripts, local actions,
package commands, or other head-controlled code there. The pinned Cacophony
action may read the checked-out head, but it loads the prompt itself from the
base commit.

### Stacked rollout

Introduce one persona per pull request:

1. merge reviewer A;
2. raise reviewer B, which must pass reviewer A;
3. merge reviewer B;
4. raise reviewer C, which must pass reviewers A and B.

A workflow introduced by a pull request is not yet trusted on the base branch
and should not review its own introduction. The prompt-availability step makes
that bootstrap state an explicit skip instead of an error.

Treat structured findings as merge blockers according to policy. Distinguish
them from framework failures:

- supported finding: remediate the code and rerun;
- prompt not on base: expected only on the reviewer's introduction pull request;
- provider HTTP 429: `rate-limit-retries: 2` means two retries after the initial
  request, for three total attempts; Cacophony then writes an
  `inconclusive` non-review outcome and fails the step closed because no
  reviewer decision was completed; this is neither approval nor a
  findings-based block;
- provider HTTP 5xx: rerun once;
- no valid report within the budget: increase the reviewer budget in a separate
  prerequisite pull request rather than bypassing the gate.

## 4. Install an agent in another repository

Create:

```text
.cacophony/agents/<slug>.md
.github/workflows/<slug>.yml
```

Do not copy Cacophony implementation source. Reference a reviewed full commit
SHA.

Configure:

- repository secret `CACOPHONY_AZURE_API_KEY`;
- repository variable `CACOPHONY_AZURE_ENDPOINT`;
- a reviewed Azure deployment name hardcoded in this agent's workflow.

The canonical simple consumer workflow is the README quick start: use
`pull_request` with an always-running job that explicitly fails fork pull
requests before checkout or review. Do not guard the entire job with a
same-repository condition. For a trusted-base workflow that reviews forks, use the
same architecture as Cacophony's `.github/workflows/cacophony-review.yml`: one
repository-owned reusable workflow holds the trust boundary and thin
`pull_request_target` persona callers provide only agent settings. Pin every
remote action in that reusable workflow to a full commit SHA, use read-only
permissions and a base-commit prompt, execute no head-controlled code, and
scope the secret only to the Cacophony step. Reject unauthorized fork authors
before checkout, and use per-pull-request concurrency in each caller to cancel
superseded Azure-backed reviews.

An external repository does not need the `examples/reviewers` copy or Cacophony
documentation tests unless its maintainers want a local catalog.

## 5. Validate and publish

Inside Cacophony:

```bash
node --test
ruby -e 'require "yaml"; Dir["{action.yml,.github/workflows/*.yml,examples/basic/.github/workflows/*.yml}"].each { |f| YAML.load_file(f) }'
git diff --check
```

Also verify:

- active and sample prompts are identical;
- workflow filename, prompt slug, artifact name, and output path agree;
- every remote action reference in each workflow created or modified by this
  process is a full commit SHA;
- the API key appears only in `secrets`, never variables or committed files;
- existing reviewers run and their JSON artifacts contain completed structured
  results.

Open a pull request. Do not merge a new Cacophony persona until every previously
merged persona has completed successfully.
