# Step 1: Discover the mode and repository

Read repository instructions before editing. Locate:

- `.cacophony/agents`;
- reviewer workflows under `.github/workflows`;
- existing sample prompts;
- repository test and validation commands.

Choose one mode:

## Cacophony repository mode

Use when adding an example persona to Cacophony itself. This mode creates an
active prompt, catalog copy, independent workflow, documentation, tests, and
one separately gated pull request.

## Consumer repository mode

Use when installing a reviewer into another repository. This mode creates a
local prompt and workflow that reference a reviewed Cacophony commit.

If the mode is ambiguous, ask one focused question before continuing.

For consumer mode, obtain the Cacophony source URL or reviewed action commit.
