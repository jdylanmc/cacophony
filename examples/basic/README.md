# Basic same-repository consumer example

This example is the simple `pull_request` installation mode for branches in the
same repository. It invokes the pinned Cacophony action directly, maps
`CACOPHONY_AZURE_API_KEY` on that action step, and uses an unsupported-mode
guard to reject fork use before checkout.

This is intentionally not the trusted-base fork-review architecture. To review
forks, create a repository-owned reusable workflow modeled on
`.github/workflows/cacophony-review.yml` and thin `pull_request_target` callers.
The reusable workflow owns authorization, trusted checkout, base-commit prompt
loading, secret-to-environment mapping, action invocation, and artifact upload.
This simple workflow never calls that reusable worker. The worker has only
`workflow_call`, is never directly event-triggered, and is called only from a
trusted-base persona workflow.
