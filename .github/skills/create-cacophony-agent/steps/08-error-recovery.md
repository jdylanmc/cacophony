# Step 7: Error recovery

## User has not supplied the reviewer

Stop. Ask for the lens or raw prompt. Do not invent it.

## Prompt is absent from the base commit

Expected only on the persona's introduction pull request. The new workflow
should skip until the prompt is merged.

## Existing reviewer reports findings

Read the structured artifact. Remediate supported findings and rerun. Never
disable or bypass the reviewer.

## Provider returns HTTP 5xx

Rerun once. If it persists, report the provider failure separately from
reviewer findings.

## Provider returns HTTP 429

Treat Cacophony's `inconclusive` report as a distinct non-review outcome. It is
neither approval nor a findings-based block, and it must fail closed regardless
of the findings threshold because no reviewer decision was completed. Before
that result, Cacophony retries the configured number of times (two by default)
using Azure's retry header as the base for exponential backoff, bounded by the
total action timeout. Retry after quota is available.

## Reviewer exhausts its turn budget

Create a separate prerequisite pull request raising that established reviewer's
budget. Require the existing stack to approve it, merge it, update the blocked
persona branch, and rerun.

## Active and sample prompts drift

Choose the user's canonical prompt, copy it exactly to the other location, and
retain the equality test.

## Repository configuration is missing

Never request a key in chat. The API key belongs in GitHub Actions secrets.
Endpoint and deployment identifiers belong in repository variables.

## Pull request workflow exposes secrets

Restore the trust boundary: trusted base workflow, pinned remote action,
base-commit prompt, read-only permissions, no execution of head-controlled
code, and secret scope limited to the Cacophony step.
