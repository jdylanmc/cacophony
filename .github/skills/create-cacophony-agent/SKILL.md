---
name: create-cacophony-agent
description: Creates a new Cacophony review agent when the user asks to add a reviewer, adapt a persona prompt, add a Cacophony example agent, or install an agent into another repository.
allowed-tools:
    - read_file
    - create_file
    - replace_string_in_file
    - list_dir
    - grep_search
    - run_in_terminal
    - ask_questions
---

# Create a Cacophony agent

Create one focused reviewer in either the Cacophony repository or a consumer
repository.

Constraint: Do not invent a reviewer when the user intends to provide its
definition. Do not combine multiple new personas in one pull request. Do not
copy Cacophony implementation source into a consumer repository.
Do not execute repository-defined commands until the provenance and
confirmation gate in Step 5 (Validate) is satisfied.

## Lifecycle

Read and execute these steps in order. Load only the current step and any file
it explicitly references.

1. [Discover the mode and repository](steps/01-discover-mode.md)
2. [Gather the reviewer contract](steps/02-gather-contract.md)
3. [Adapt the prompt](steps/03-adapt-prompt.md)
4. Choose exactly one implementation path:
   - [Add an agent inside Cacophony](steps/04-cacophony-repository.md)
   - [Install an agent in another repository](steps/05-consumer-repository.md)
5. [Validate the implementation](steps/06-validate.md)
6. [Publish and enforce reviewer gates](steps/07-publish-and-gates.md)
7. Use [error recovery](steps/08-error-recovery.md) whenever a step fails.

The detailed reference is
[`docs/creating-agents.md`](../../../docs/creating-agents.md).

---

<!-- 🤖 This skill was created using the create-skill AI skill. https://github.com/gaming-microsoft/ai-skills -->
