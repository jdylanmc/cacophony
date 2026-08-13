# Cacophony

Cacophony runs adversarial pull request reviews from prompt-defined agent lenses.
One action invocation runs one Markdown prompt, inspects the checked-out pull
request with bounded read-only tools, and writes:

- a canonical JSON report;
- a human-readable Markdown report;
- action outputs for verdict, severity, report paths, and agent ID.

The consuming repository owns orchestration. Run multiple prompts as sequential
steps, matrix jobs, or separate workflows.

## Requirements

- A GitHub Actions workflow triggered by `pull_request` by default, or a
  `pull_request_target` workflow that follows the documented trusted-base
  pattern.
- An Azure AI Foundry model deployment that supports the Responses API and
  function tools.
- The project endpoint, such as
  `https://<resource>.services.ai.azure.com/api/projects/<project>`, or an
  OpenAI-compatible endpoint ending in `/openai/v1`.
- An API key stored as the repository secret `CACOPHONY_AZURE_API_KEY`.

Cacophony itself has no runtime package dependencies, install step, build step,
or generated distribution bundle.

## Repository dogfood

The repository dogfoods Cacophony through its six canonical adversarial
reviewers: Gilfoyle, Solid Snake, GLaDOS, Master Chief, Fletcher, and Delamain.
Their prompts live under `.cacophony/agents/`, and their workflows run
independently on pull requests.

The built-in dogfood workflows require `CACOPHONY_AZURE_API_KEY`,
`CACOPHONY_AZURE_ENDPOINT`, and endpoint deployments named `gpt-5.4-mini`
(GLaDOS and Delamain) and `gpt-5.6-sol` (Gilfoyle, Solid Snake, Master Chief,
and Fletcher).

This repository's dogfood persona workflows are thin `pull_request_target`
callers of `.github/workflows/cacophony-review.yml`. That reusable workflow
owns the pinned Cacophony invocation, authorization, trusted checkout,
base-prompt check, secret scope, and artifact upload. Each caller owns its
`pull_request_target` trigger, read-only permissions, and per-pull-request
concurrency. The reusable worker reads authoritative pull-request metadata from
the inherited GitHub event context. Before checkout, it rejects any other event,
allows a same-repository pull request, and allows a fork only when GitHub's
`author_association` is `OWNER`, `MEMBER`, or `COLLABORATOR`. It inspects pull
request content without executing it.

## Quick start

This quick start is the simple mode for pull requests whose branches are in the
same repository. Its first step is an unsupported-mode guard: it fails if a
fork attempts to use this simple workflow, but it does not authorize or review
the fork. All actual fork review uses the trusted-base `pull_request_target`
pattern in
[`docs/creating-agents.md`](docs/creating-agents.md), including its author
authorization and concurrency controls. The checked-in
[`examples/basic`](examples/basic/) directory mirrors this simple mode; it is
not a trusted-base fork-review template. The simple workflow never calls
`.github/workflows/cacophony-review.yml`; that reusable worker is callable only
from a `pull_request_target` trusted-base persona workflow and is never a direct
event trigger.

1. In the target repository, open **Settings > Secrets and variables > Actions**.
2. Create the secret `CACOPHONY_AZURE_API_KEY`.
3. Create the repository variable `CACOPHONY_AZURE_ENDPOINT` with the Azure AI
   Foundry project or OpenAI-compatible endpoint. The workflow below declares
   `deployment: gpt-5.4-mini` directly; edit that literal to select a different
   deployment. It also sets `rate-limit-retries: 2`, meaning two retries after
   the initial request, for three total attempts.
4. Create `.cacophony/agents/reviewer.md`:

   ```markdown
   Review this pull request for correctness defects.

   Focus on behavior changed by the pull request. Report only actionable defects
   introduced by the change. Cite exact files and lines, explain the impact, and
   recommend the smallest safe correction. If no defect is supported by evidence,
   return a passing report with no findings.
   ```

5. Create `.github/workflows/cacophony.yml`:

   ```yaml
   name: Cacophony

   on:
     pull_request:

   permissions:
     contents: read

   jobs:
     correctness:
       runs-on: ubuntu-latest
       steps:
         - name: Reject fork use of simple mode
           if: github.event.pull_request.head.repo.full_name != github.repository
           run: |
             echo "::error::This same-repository-only workflow does not review forks. Install the documented trusted-base workflow."
             exit 1

         - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
           with:
             fetch-depth: 0

         - name: Run correctness review
           id: review
           uses: jdylanmc/cacophony@2ab5ef5d3556d52ffddef891305ab1ddfe8b7412
           with:
             prompt-file: .cacophony/agents/reviewer.md
             endpoint: ${{ vars.CACOPHONY_AZURE_ENDPOINT }}
             deployment: gpt-5.4-mini
             rate-limit-retries: 2
             fail-on: high
           env:
             CACOPHONY_AZURE_API_KEY: ${{ secrets.CACOPHONY_AZURE_API_KEY }}

         - name: Upload Cacophony report
           if: always() && steps.review.outcome != 'skipped'
           uses: actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4 # v5
           with:
             name: cacophony-correctness
             path: .cacophony/out/
   ```

6. Open or update a pull request from a branch in the same repository. The
   workflow produces the `cacophony-correctness` artifact.

### Secret wiring by workflow mode

These contracts are mutually exclusive:

| Mode | Caller wiring | Action environment |
| --- | --- | --- |
| Simple same-repository `pull_request` | The job invokes `jdylanmc/cacophony` directly. Do not use `secrets.azure-api-key`. | That action step maps `CACOPHONY_AZURE_API_KEY: ${{ secrets.CACOPHONY_AZURE_API_KEY }}`. |
| Trusted-base persona caller | The job calls `.github/workflows/cacophony-review.yml` and passes `azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}` under `secrets:`. Do not put an action `env` mapping in the caller. | Only the reusable workflow maps `secrets.azure-api-key` to `CACOPHONY_AZURE_API_KEY` on its pinned action step. |

Do not combine the simple direct-action secret mapping with the trusted-base
reusable-workflow secret handoff. A trusted-base caller also passes the event
reusable-workflow secret handoff. A trusted-base caller must not restate event
identity, pull-request coordinates, repository origin, or author association;
the reusable worker reads those authoritative values from the inherited GitHub
event context.

## Prompt contract

A prompt is the review lens, not a workflow script. It should describe:

- the risks or quality dimension to examine;
- what evidence is required;
- what should not be reported;
- any repository-specific invariants.

Cacophony adds trusted framework instructions requiring tool-based inspection,
evidence, and a final structured `submit_report` call. Pull request text and
repository content are explicitly treated as untrusted data.

### Structured evidence from earlier jobs

Earlier workflow steps or jobs can supply analyzer, test, or build output
through the optional multiline `evidence-files` input. Each entry is a
workspace-relative file that must already exist when Cacophony starts:

```yaml
with:
  evidence-files: |
    .cacophony/evidence/codeql.sarif
    .cacophony/evidence/unit-tests.junit.xml
```

Cacophony inventories declared evidence in the initial reviewer context and
adds bounded `list_evidence`, `search_evidence`, and chunked `read_evidence`
tools. A file is limited to 10 MB, all declared evidence is limited to 20 MB,
and at most 20 files may be declared. Evidence is read-only and treated as
untrusted analyzer output; prompts should require findings to be corroborated
against repository source and pull request changes.

For evidence produced in another job, upload the files as an artifact, download
them into the checked-out workspace, and pass their resulting paths to
`evidence-files`. The trusted-base reusable workflow supports this with its
optional `evidence-artifact` and `evidence-files` inputs. Gilfoyle demonstrates
the pattern with CodeQL Static Analysis Results Interchange Format (SARIF)
output, while GLaDOS consumes verbose and JUnit unit-test reports. Their
producer jobs have no Azure secret; only the reusable review job receives the
provider key.

Both supported workflow modes load the prompt from the pull request's base
commit, so a pull request cannot weaken its own review instructions and a newly
added prompt begins running only after its setup change is merged. The modes
differ elsewhere: the quick start uses `pull_request`, rejects forks because
repository secrets are unavailable, and reviews same-repository changes; the
trusted-base `pull_request_target` pattern authorizes fork authors before its
secret-backed step and inspects the merge ref without executing pull-request
code.

## Repository-wide ad-hoc audit

`.github/workflows/repository-audit.yml` is a repository-owned reusable
workflow with both `workflow_dispatch` and `workflow_call`. It audits the full
checked-out commit rather than a pull request diff and runs the three canonical
adversaries sequentially to reduce provider throttling:

1. Gilfoyle with `gpt-5.6-sol`;
2. Solid Snake with `gpt-5.6-sol`;
3. GLaDOS with `gpt-5.4-mini`.

The workflow accepts only the default branch, checks it out as audit data, and
runs an independently pinned Cacophony action implementation. Reviewer prompts
come from that pinned action revision, not from the audited checkout. The Azure
key is never exposed to code from the commit under audit. Each reviewer receives
read and search tools for working-tree source files; Git metadata and generated
dependency directories such as `node_modules` are excluded. Any finding
severity fails its matrix job, while `fail-fast: false` ensures all three
reports are uploaded as separate artifacts. Run it from the Actions tab with
**Run workflow**, or call it from another workflow in this repository:

```yaml
jobs:
  repository-audit:
    uses: ./.github/workflows/repository-audit.yml
    secrets:
      azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}
```

The manual dispatch reads the repository's existing
`CACOPHONY_AZURE_ENDPOINT` variable and `CACOPHONY_AZURE_API_KEY` secret.
Repository audit mode is intended for trusted checked-out commits; it never
executes repository code.

## Action inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `prompt-file` | Yes | | Markdown prompt under `.cacophony/`. |
| `endpoint` | Yes | | Azure AI Foundry project or OpenAI-compatible endpoint. |
| `deployment` | Yes | | Model deployment name. |
| `provider` | No | `azure-foundry` | Provider adapter. |
| `review-scope` | No | `pull-request` | `pull-request` for event review or `repository` for a full checked-out repository audit. |
| `workspace-directory` | No | `.` | Repository-relative checkout directory to inspect. |
| `evidence-files` | No | | Multiline workspace-relative paths to structured evidence produced before the review. |
| `max-turns` | No | `8` | Model turns, from 1 through 20. Cacophony tells the reviewer its exact and remaining budget, provides `request_more_turns` to emit a workflow warning when the budget is insufficient, directs finalization during the last three turns, and reserves the final turn for `submit_report`. |
| `timeout-seconds` | No | `300` | Total deadline, including retry waits, from 30 through 1800 seconds. |
| `rate-limit-retries` | No | `2` | Retries after the initial HTTP 429 request, from 0 through 10; `2` means three total attempts. |
| `fail-on` | No | `high` | `low`, `medium`, `high`, `critical`, or `never`. |
| `output-directory` | No | `.cacophony/out` | Repository-relative report root. |

The action accepts the API key only through the `CACOPHONY_AZURE_API_KEY`
environment variable. Use the mode-specific table above to determine which
workflow owns that mapping.

## Outputs and failure policy

| Output | Description |
| --- | --- |
| `verdict` | `pass`, `warn`, and `fail` are findings-derived values. `inconclusive` is a terminal value meaning no reviewer decision completed; it always exits nonzero and should be retried when quota is available. `error` is the terminal framework-failure value. |
| `max-severity` | `none`, `low`, `medium`, `high`, or `critical`. |
| `report-json` | Repository-relative JSON report path. |
| `report-markdown` | Repository-relative Markdown report path. |
| `agent-id` | ID derived from the prompt filename. |

Reports and outputs are written before findings-based failure is applied. Use
`if: always()` on artifact upload steps. The complete Markdown report is also
appended to the GitHub job summary, where findings and remediation render
directly without downloading the artifact. Failure annotations include the
agent's submitted summary instead of only a generic severity message.

Completed reviews use `pass`, `warn`, or `fail`, derived from their findings.
`fail-on` is an inclusive severity threshold for those completed reviews. For
example, `high` fails on `high` and `critical` findings; `never` prevents
findings from failing the step.

`inconclusive` is a terminal verdict/output value: the provider did not
complete a reviewer decision. It is neither approval nor a findings-derived
block, and it always fails the step closed regardless of `fail-on`; retry after
the provider is available. `error` is the terminal verdict/output value for a
framework failure such as authentication failure, timeout, invalid model
output, or exhausted turn budget and also always fails.

Azure AI Foundry HTTP 429 throttling produces an `inconclusive` report and a
workflow warning, then fails the step closed after `rate-limit-retries` is
exhausted. `rate-limit-retries: 2` means two retries after the initial request,
for three total attempts. Retry delays use
Azure's `retry-after-ms`,
`x-ms-retry-after-ms`, or `Retry-After` value as the base and multiply it by
`2^retryIndex`. If Azure provides no delay, the base is one second. The total
`timeout-seconds` deadline remains the hard ceiling. Inconclusive is not
approval or a findings-based verdict; retry the run after quota is available.

## Report format

The JSON report is the canonical artifact. Markdown is rendered from it.

```json
{
  "schemaVersion": "1.0",
  "status": "completed",
  "agent": {
    "id": "reviewer",
    "promptFile": ".cacophony/agents/reviewer.md"
  },
  "provider": {
    "name": "azure-foundry",
    "deployment": "review-model"
  },
  "reviewScope": "pull-request",
  "pullRequest": {},
  "repository": null,
  "startedAt": "2026-08-13T14:00:00.000Z",
  "completedAt": "2026-08-13T14:01:00.000Z",
  "execution": {
    "turns": 2,
    "toolCalls": 4
  },
  "verdict": "fail",
  "maxSeverity": "high",
  "summary": "One correctness defect was found.",
  "findings": [
    {
      "id": "finding-1",
      "severity": "high",
      "title": "Incorrect arithmetic",
      "explanation": "The changed implementation subtracts instead of adding.",
      "recommendation": "Restore addition.",
      "evidence": [
        {
          "path": "src/math.js",
          "line": 12,
          "detail": "The function returns a - b."
        }
      ]
    }
  ]
}
```

The agent proposes a verdict, but Cacophony derives the canonical report
verdict from validated findings: no findings is `pass`, low or medium findings
is `warn`, and high or critical findings is `fail`.

Terminal reports without a reviewer decision use the same envelope with no
findings. An exhausted provider retry budget produces:

```json
{
  "schemaVersion": "1.0",
  "status": "inconclusive",
  "execution": {
    "turns": 0,
    "toolCalls": 0
  },
  "verdict": "inconclusive",
  "maxSeverity": "none",
  "summary": "Azure AI Foundry rate limit exceeded (429); review is inconclusive",
  "findings": []
}
```

No reviewer decision exists in that report. `inconclusive` is nevertheless the
terminal value of the public `verdict` field. It always fails closed and should
be retried when quota is available. Framework failures use the same empty
findings shape with both `status` and `verdict` set to `error`.

For pull request scope, the agent can use `get_pull_request`,
`list_changed_files`, `get_diff`, `read_file`, `list_files`, and `search_text`.
Repository scope exposes only `read_file`, `list_files`, and `search_text`.
When evidence is declared, either scope also receives `list_evidence`,
`search_evidence`, and `read_evidence`. Neither scope can execute commands or
write repository files.

## Multiple agents

Each checked-in or copied example declares its selected Azure deployment
directly in workflow YAML. Edit that literal when choosing a different model;
the examples require only the endpoint variable and API key secret.

For a small sequential workflow, repeat the action step with a different
`prompt-file` and step ID. For parallel reviews, use a matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - agent: correctness
        deployment: gpt-5.4-mini
      - agent: security
        deployment: gpt-5.6-sol
      - agent: maintainability
        deployment: gpt-5.4-mini

steps:
  - uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09 # v5
    with:
      fetch-depth: 0
  - id: review
    uses: jdylanmc/cacophony@2ab5ef5d3556d52ffddef891305ab1ddfe8b7412
    with:
      prompt-file: .cacophony/agents/${{ matrix.agent }}.md
      endpoint: ${{ vars.CACOPHONY_AZURE_ENDPOINT }}
      deployment: ${{ matrix.deployment }}
      rate-limit-retries: 2
    env:
      CACOPHONY_AZURE_API_KEY: ${{ secrets.CACOPHONY_AZURE_API_KEY }}
  - if: always()
    uses: actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4 # v5
    with:
      name: cacophony-${{ matrix.agent }}
      path: .cacophony/out/
```

## Sample reviewers

See [Creating Cacophony agents](docs/creating-agents.md) for the complete
prompt, workflow, validation, and stacked-rollout process. The repository-shared
[`create-cacophony-agent` skill](.github/skills/create-cacophony-agent/SKILL.md)
walks Copilot through either adding a sample persona here or installing a
reviewer in another repository. Reviewer contracts live only under
`.cacophony/agents/`.

### Gilfoyle the Security Architect

[`.cacophony/agents/gilfoyle-security-architect.md`](.cacophony/agents/gilfoyle-security-architect.md)
is a persona-driven application security reviewer. It reports only concrete
exploitation paths, requires exact evidence and numbered remediation, and uses
`[BLOCK: SECURITY]` or `[APPROVED]` summaries.

This repository dogfoods the reviewer through
`.github/workflows/gilfoyle-security-architect.yml`. The thin caller declares
`gpt-5.6-sol` and delegates the shared trusted-base review sequence to
`.github/workflows/cacophony-review.yml`.

### Solid Snake, SOLID Architecture Operative

[`.cacophony/agents/solid-snake-architecture.md`](.cacophony/agents/solid-snake-architecture.md)
reviews Single Responsibility Principle (SRP), dependency boundaries,
interface segregation, and open/closed extension points without demanding
abstractions for their own sake. Findings use `[BLOCK: ARCHITECTURE]` and
numbered code-comms extraction steps; clean changes use `[APPROVED]`.

`.github/workflows/solid-snake-architecture.yml` runs independently from
Gilfoyle on the same pull request event, so GitHub schedules both reviews in
parallel and uploads separate artifacts. Snake's thin caller declares
`gpt-5.6-sol`; the shared reusable workflow owns the trusted checkout, pinned
action, and base-commit prompt loading.

### GLaDOS, Documentation Synchronization Sentinel

[`.cacophony/agents/glados-documentation-sentinel.md`](.cacophony/agents/glados-documentation-sentinel.md)
cross-references changed behavior with untouched documentation, examples,
configuration references, names, and inline comments. Supported mismatches use
`[BLOCK: TESTING_ANOMALY]` with numbered synchronization steps; globally
consistent changes use `[APPROVED]`.

`.github/workflows/glados-documentation-sentinel.yml` runs independently from
Gilfoyle and Solid Snake. Once merged, all three reviewers execute in parallel
on subsequent pull requests and upload separate artifacts. Her thin caller
declares `gpt-5.4-mini` directly.

### Delamain, Documentation Custodian

[`.cacophony/agents/delamain-documentation-custodian.md`](.cacophony/agents/delamain-documentation-custodian.md)
reviews documentation information architecture, progressive disclosure,
heading/list/table structure, Markdown rendering, navigation and discoverability,
links, anchors, and path casing. It requires evidence of a real onboarding or
rendering hazard before proposing a collapsed machine-facing compartment.
Factual implementation and configuration synchronization remains GLaDOS's
exclusive route. Findings use `[BLOCK: SERVICE_DISRUPTION]`; an unobstructed
route uses `[APPROVED]`.

`.github/workflows/delamain-documentation-custodian.yml` is an independent thin
trusted-base caller. It uses `gpt-5.4-mini` with the standard 20-turn,
600-second budget and delegates authorization, trusted checkout, retry policy,
prompt loading, secret scope, and artifact upload to the shared reusable
workflow.

### Master Chief, Domain Commander

[`.cacophony/agents/master-chief-domain-commander.md`](.cacophony/agents/master-chief-domain-commander.md)
reviews Domain-Driven Design (DDD) boundaries, You Aren't Gonna Need It
(YAGNI), Keep It Simple, Stupid (KISS), and Code Complete mechanics. It blocks
only evidence-backed overengineering, opaque control flow, and misplaced domain
rules. Findings use `[BLOCK: OVERENGINEERED]` with numbered mechanical
remediation orders; mission-essential changes use `[APPROVED]`.

`.github/workflows/master-chief-domain-commander.yml` is an independent thin
caller, so the persona reviewers run in parallel and upload separate artifacts.
Master Chief declares `gpt-5.6-sol` with the established 20-turn, 600-second
pull-request budget.

### Fletcher, Prompt Conductor

[`.cacophony/agents/fletcher-prompt-conductor.md`](.cacophony/agents/fletcher-prompt-conductor.md)
audits only changed Cacophony agent prompts for domain isolation, forceful
directives, exact structured-report contracts, persona preservation, evidence
boundaries, and material token waste. Supported defects use `[BLOCK: PROMPT]`
with numbered, copy-pasteable corrections; a clean score uses `[APPROVED]`.

`.github/workflows/fletcher-prompt-conductor.yml` is a thin trusted-base caller
using `gpt-5.6-sol`, the standard 20-turn pull-request budget, and the shared
reusable review workflow. Its top-level `pull_request_target.paths` filter is
exactly `.cacophony/agents/**`, so GitHub schedules Fletcher only when the pull
request adds, changes, renames, or deletes an agent-prompt path. Code-only and
unrelated pull requests never reach the reusable workflow, model, or secret.

## Security

- The simple `pull_request` consumer pattern must use an always-running job with
  an unsupported-mode guard that fails fork use before any secret-bearing step.
  That guard does not authorize or review forks. Never put the only review job
  behind a same-repository condition because GitHub treats a skipped required
  job as successful.
- A `pull_request_target` persona caller may review forks only through a
  trusted-base reusable workflow that owns the pinned action, base-commit
  prompt, authorization, checkout, and secret scope. Each caller owns read-only
  permissions and per-pull-request concurrency. The reusable workflow rejects
  non-`pull_request_target` events, accepts same-repository pull requests, and
  accepts forks only for `OWNER`, `MEMBER`, or `COLLABORATOR`
  `author_association` values before checkout. It executes no head-controlled
  code. Code-execution safety does not authorize strangers to spend provider
  quota.
- Repository secrets are unavailable to `pull_request` workflows from forks.
  The quick-start workflow fails those pull requests explicitly rather than
  silently passing a skipped gate.
- Cacophony rejects absolute paths, traversal, `.git` access, and symlinks that
  resolve outside the workspace.
- Tool outputs are bounded. There is no arbitrary command tool.
- Keep prompts under review like any other code. They determine what is sent to
  the configured model endpoint.
- Keep Cacophony pinned to a reviewed full commit SHA. Update the pin through a
  normal dependency review when adopting a newer release.

## Troubleshooting

- **Missing API key, simple mode:** verify the secret is named exactly
  `CACOPHONY_AZURE_API_KEY` and the direct Cacophony action step maps it through
  `env`. Do not use `secrets.azure-api-key`.
- **Missing API key, trusted-base mode:** the persona caller must pass
  `azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}` under `secrets:`.
  Only the reusable workflow maps `secrets.azure-api-key` to the action's
  `CACOPHONY_AZURE_API_KEY` environment variable.
- **Azure 404:** verify the project endpoint and deployment. Cacophony appends
  `/openai/v1/responses` unless the endpoint already ends in `/responses`.
- **Azure 429:** `rate-limit-retries: 2` means two retries after the initial
  request, for three total attempts, with header-based exponential backoff within
  `timeout-seconds`. Persistent throttling writes an `inconclusive` report and
  fails the step because no reviewer decision was completed.
- **Git diff failure:** use `actions/checkout` with `fetch-depth: 0`.
- **No report submission:** Cacophony announces the remaining turn budget,
  directs the reviewer to finalize during the last three turns, and exposes
  only `submit_report` on the final turn. If submission still fails, tighten
  the review lens or reduce the amount of repository context it must traverse.
- **Reviewer requests more turns:** `request_more_turns` emits a GitHub Actions
  warning containing the requested capacity and reason. It does not extend the
  current run; use the warning to tune a later run or narrow the review lens.
- **Fork pull request rejected:** the simple workflow fails closed because
  GitHub does not expose repository secrets to fork workflows. Use the
  documented trusted-base pattern when fork reviews are required.
- **Report exists but step failed:** inspect the artifact. Reports are written
  before severity policy is applied.

## Instructions for Copilot or another coding agent

When asked to install Cacophony in a repository, perform these steps exactly:

1. Confirm the repository uses GitHub Actions and identify whether it already
   has a pull request workflow that should be extended.
2. Create `.cacophony/agents/reviewer.md` using the starter prompt from Quick
   start unless the user supplied a specific review lens.
3. Create or update `.github/workflows/cacophony.yml` using the Quick start
   workflow. Preserve unrelated existing workflow behavior.
4. Keep `permissions: contents: read`, pin Checkout to the documented full
   commit SHA, and
   `fetch-depth: 0`.
5. Reference
   `jdylanmc/cacophony@2ab5ef5d3556d52ffddef891305ab1ddfe8b7412`;
   do not copy Cacophony source into the consumer repository.
6. Use the repository variable `CACOPHONY_AZURE_ENDPOINT` and declare the
   reviewer's model deployment directly in its workflow.
7. In the default simple workflow, map the repository secret
   `CACOPHONY_AZURE_API_KEY` into the review step's environment. In a
   trusted-base thin caller, pass it as `secrets.azure-api-key` and let the
   reusable workflow map it to the action environment. Never place the key in a
   committed file.
8. Add Upload Artifact pinned to the documented full commit SHA with
   `if: always()` and path
   `.cacophony/out/`.
9. Default to `pull_request` with an always-running job whose unsupported-mode
   guard fails fork use before checkout or review. The guard is not a fork
   authorization path. Use `pull_request_target` only for the documented
   trusted-base pattern with one repository-owned reusable workflow holding
   every pinned remote action, the base-commit prompt, read-only permissions,
   authorization before checkout, no execution of head-controlled code, and
   API-key mapping. Keep persona callers narrow and give each per-pull-request
   concurrency.
10. Confirm the workflow passes `rate-limit-retries` explicitly or relies on
    the documented default of `2`, and that exhausted HTTP 429 retries produce
    an `inconclusive` report that fails closed.
11. Validate the resulting YAML syntax and report this expected tree:

    ```text
    .cacophony/
      agents/
        reviewer.md
    .github/
      workflows/
        cacophony.yml
    ```

11. Tell the user to create the secret and variables in repository settings if
    the current tooling cannot create them securely.

Copy-paste request for a new chat:

> Set up Cacophony in this repository. Follow the installation contract at
> https://github.com/jdylanmc/cacophony#instructions-for-copilot-or-another-coding-agent
> and use the correctness starter prompt unless this repository already
> documents a more appropriate review lens.

## Development

Node.js 24 is the only prerequisite:

```bash
node --test
node --check src/index.js
```

No `npm install` is required.

Use the small report helper to validate model-style submission JSON or render a
complete report:

```bash
node scripts/report.js validate submission.json
node scripts/report.js render report.json report.md
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for release expectations.
