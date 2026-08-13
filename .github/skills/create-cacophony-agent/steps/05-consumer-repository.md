# Step 4B: Install an agent in another repository

Create:

```text
.cacophony/agents/<slug>.md
.github/workflows/<slug>.yml
```

Reference every remote action, including Cacophony, Checkout, and Upload
Artifact, by a reviewed full commit SHA. Never copy Cacophony's `src/`.

Required repository settings:

- secret `CACOPHONY_AZURE_API_KEY`;
- variable `CACOPHONY_AZURE_ENDPOINT`.

Hardcode the selected Azure deployment name in this agent's workflow so the
reviewer carries its model choice to another repository.

Default to the README quick-start `pull_request` workflow with an always-running
job that explicitly fails fork pull requests before checkout or review. Never
put the only review job behind a same-repository condition.

Use `pull_request_target` only for a trusted-base workflow where:

- the Cacophony action is pinned;
- prompt content comes from the base commit;
- permissions are read-only;
- no head-controlled code is executed;
- the API key exists only on the Cacophony step.

Do not add a sample catalog copy unless requested.
