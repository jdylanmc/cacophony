# Step 5: Validate

Run the repository's existing tests and YAML checks.

Verify:

1. no prompt placeholders remain;
2. prompt slug, workflow path, artifact name, and output path agree;
3. active and sample prompts match in Cacophony mode;
4. every remote `uses:` dependency uses a full commit SHA, never a mutable tag;
5. no credential is committed or stored as a variable;
6. workflow trust guards and comments remain intact;
7. the agent has a sufficient turn and timeout budget;
8. `git diff --check` passes.

Inside Cacophony, run:

```bash
node --test
ruby -e 'require "yaml"; Dir["{action.yml,.github/workflows/*.yml,examples/basic/.github/workflows/*.yml}"].each { |f| YAML.load_file(f) }'
git diff --check
```
