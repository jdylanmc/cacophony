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

Treat `inconclusive` as a terminal verdict/output value meaning no reviewer
decision was completed. It is neither approval nor a findings-derived block,
and it must fail closed regardless of the findings threshold. Before that
result, `rate-limit-retries: 2` means two retries after the initial request, for
three total attempts. Cacophony uses Azure's retry header as the base for
exponential backoff, bounded by the total action timeout. Retry after quota is
available.

## Reviewer exhausts its turn budget

Create a separate prerequisite pull request raising that established reviewer's
budget. Require the existing stack to approve it, merge it, update the blocked
persona branch, and rerun.

## Repository configuration is missing

Never request a key in chat. Restore the missing item according to the canonical
[consumer repository configuration contract](05-consumer-repository.md);
recovery must not redefine where secrets, endpoint configuration, or deployment
selection belong.

## Pull request workflow exposes secrets

Restore the trust boundary: trusted base workflow, pinned remote action,
base-commit prompt, read-only permissions, no execution of head-controlled
code, and secret scope limited to the Cacophony step.
