# Step 4B: Install an agent in another repository

Create:

```text
.cacophony/agents/<slug>.md
.github/workflows/<slug>.yml
```

Reference every remote action in the workflow this skill creates, including
Cacophony, Checkout, and Upload Artifact, by a reviewed full commit SHA. Never
copy Cacophony's `src/`.

Required repository settings:

- secret `CACOPHONY_AZURE_API_KEY`;
- variable `CACOPHONY_AZURE_ENDPOINT`.

Hardcode the selected Azure deployment name in this agent's workflow so the
reviewer carries its model choice to another repository.

The canonical simple consumer workflow is the README quick-start
`pull_request` workflow: use an always-running job whose unsupported-mode guard
fails fork use before checkout or review. That guard does not authorize or
review forks. Never put the only review job behind a same-repository condition.
Because this mode invokes the action directly, map `CACOPHONY_AZURE_API_KEY`
through the action step's `env`. It never calls the reusable worker.

Use `pull_request_target` only for a trusted-base workflow where:

- one repository-owned reusable workflow contains the shared trust boundary;
- the reusable worker has only `workflow_call`, is never directly
  event-triggered, and is called only by a `pull_request_target` persona
  workflow;
- persona workflows are thin callers that provide only agent settings;
- callers do not pass event identity or pull-request security context; the
  reusable worker reads those authoritative values from the inherited GitHub
  event;
- each caller owns its `pull_request_target` trigger, read-only permissions, and
  per-pull-request concurrency;
- the Cacophony action and every remote dependency in the reusable workflow are
  pinned;
- prompt content comes from the base commit;
- permissions are read-only;
- no head-controlled code is executed;
- the reusable workflow rejects other events, accepts same-repository pull
  requests, and accepts a fork only for an `OWNER`, `MEMBER`, or `COLLABORATOR`
  author before checkout;
- the caller declares `azure-api-key: ${{ secrets.CACOPHONY_AZURE_API_KEY }}`
  under the reusable-workflow job's `secrets:` mapping;
- the reusable workflow receives that declared input as
  `secrets.azure-api-key`;
- only the reusable workflow maps that secret to the Cacophony step's
  `CACOPHONY_AZURE_API_KEY` environment variable.

Do not add a sample catalog copy unless requested.
