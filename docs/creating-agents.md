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
- **Budget:** start complex reviewers at 20 turns and 600 seconds. Cacophony
  warns reviewers as the budget closes and reserves the final turn for
  structured report submission. Reviewers can call `request_more_turns` before
  the final turn to emit a workflow warning when the configured budget prevents
  them from meeting the lens's evidence standard; the current run is never
  extended automatically.

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

When a reviewer depends on output from an earlier analyzer or test job, have
that job upload structured text evidence, download it into the review
workspace, and declare each path with `evidence-files`. The reviewer prompt
must name the evidence it expects, require inspection through
`list_evidence`, `search_evidence`, and `read_evidence`, treat the output as
untrusted data, and require corroboration against repository source. Keep
secret-backed review execution separate from jobs that execute pull request
code.

Every run writes JSON and Markdown artifacts and appends the full Markdown
report to the GitHub job summary. A failing action annotation includes the
agent's submitted summary; the job summary contains the complete findings and
remediation.

## 3. Add an agent inside Cacophony

Create these matching files:

```text
.cacophony/agents/<slug>.md
.github/workflows/<slug>.yml
```

The active prompt under `.cacophony/agents/` is the sole reviewer-contract
source. README catalog entries link to that canonical file; do not create or
manually synchronize a second prompt copy.

Add a README entry describing the lens, block prefix, and workflow.
In every workflow created from this guide, pin each remote action reference to
a reviewed full commit SHA.

### Workflow pattern

The repository owns the security-sensitive review sequence once in
`.github/workflows/cacophony-review.yml`. It performs fork authorization,
trusted merge-ref checkout, base-prompt availability checks, the pinned
Cacophony invocation, secret scoping, and artifact upload. Each persona caller
owns its `pull_request_target` trigger, read-only permissions, and concurrency.
Before checkout, the reusable workflow rejects any other event, accepts
same-repository pull requests, and accepts fork pull requests only when
`author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`.

Each pull-request reviewer gets an independent thin caller so GitHub schedules
all established reviewers in parallel. This template intentionally retains the
20-turn pull-request budget; it is not the repository-wide audit workflow:

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

The thin caller passes only persona settings and the repository secret as
`secrets.azure-api-key`. The reusable worker reads authoritative pull-request
metadata from its inherited GitHub event context. Only it maps the secret to
the action's
`CACOPHONY_AZURE_API_KEY` environment variable. This differs intentionally from
the simple consumer quick start, where the workflow invokes the action directly
and therefore maps the secret directly on that action step.

| Mode | Required secret wiring |
| --- | --- |
| Simple `pull_request` | Direct action step `env`: `CACOPHONY_AZURE_API_KEY: ${{ secrets.CACOPHONY_AZURE_API_KEY }}`. Never use `secrets.azure-api-key`. |
| Trusted-base caller | Caller `secrets`: `azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}`. Never add the action environment mapping to the caller. |
| Reusable worker | The pinned action step alone maps `CACOPHONY_AZURE_API_KEY: ${{ secrets.azure-api-key }}`. |

The three rows are separate ownership layers, not interchangeable alternatives.

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
  `inconclusive` terminal verdict/output value and fails the step closed because
  no reviewer decision was completed; this is neither approval nor a
  findings-derived block;
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
`pull_request` with an always-running job whose unsupported-mode guard fails
fork use before checkout or review. That guard does not authorize or review
forks. Do not guard the entire job with a same-repository condition. All actual
fork review uses the same architecture as Cacophony's
`.github/workflows/cacophony-review.yml`: one repository-owned reusable
workflow holds the trust boundary and thin
`pull_request_target` persona callers provide only agent settings. Pin every
remote action in that reusable workflow to a full commit SHA, use read-only
permissions and a base-commit prompt, execute no head-controlled code, and
scope the secret only to the Cacophony step. The caller owns the
`pull_request_target` trigger, read-only permissions, and per-pull-request
concurrency. The reusable workflow rejects other events, accepts
same-repository pull requests, and accepts a fork only for an `OWNER`, `MEMBER`,
or `COLLABORATOR` author before checkout.

`examples/basic` demonstrates only the simple same-repository mode. Its direct
action invocation is intentional and must not be copied as a trusted-base fork
review workflow. The simple workflow never calls the reusable worker. The
reusable worker has only `workflow_call`, is never directly event-triggered,
and is called only by a `pull_request_target` trusted-base persona workflow.
Its direct `env` secret mapping is incompatible with a trusted-base caller,
which must use the reusable workflow's `secrets.azure-api-key` handoff instead.

An external repository does not need Cacophony's README catalog tests.

## 5. Validate and publish

Inside Cacophony:

```bash
node --test
ruby -e 'require "yaml"; Dir["{action.yml,.github/workflows/*.yml,examples/basic/.github/workflows/*.yml}"].each { |f| YAML.load_file(f) }'
git diff --check
```

Also verify:

- every README catalog entry resolves to its canonical prompt under
  `.cacophony/agents/`;
- workflow filename, prompt slug, artifact name, and output path agree;
- every remote action reference in each workflow created or modified by this
  process is a full commit SHA;
- the API key appears only in `secrets`, never variables or committed files;
- the workflow passes `rate-limit-retries` explicitly or relies on the
  documented default of `2`, and exhausted HTTP 429 retries produce an
  `inconclusive` report that fails closed;
- existing reviewers run and their JSON artifacts contain completed structured
  results.

Open a pull request. Do not merge a new Cacophony persona until every previously
merged persona has completed successfully.
