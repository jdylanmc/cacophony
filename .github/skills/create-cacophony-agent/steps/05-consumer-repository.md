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
`pull_request` workflow: use an always-running job that explicitly fails fork
pull requests before checkout or review. Never put the only review job behind a
same-repository condition. Because this mode invokes the action directly, map
`CACOPHONY_AZURE_API_KEY` through the action step's `env`.

Use `pull_request_target` only for a trusted-base workflow where:

- one repository-owned reusable workflow contains the shared trust boundary;
- persona workflows are thin callers that provide only agent settings;
- the Cacophony action and every remote dependency in the reusable workflow are
  pinned;
- prompt content comes from the base commit;
- permissions are read-only;
- no head-controlled code is executed;
- unauthorized fork authors are rejected before checkout;
- per-pull-request concurrency cancels superseded reviews;
- the caller passes `secrets.azure-api-key` to the reusable workflow;
- only the reusable workflow maps that secret to the Cacophony step's
  `CACOPHONY_AZURE_API_KEY` environment variable.

Do not add a sample catalog copy unless requested.
