# Contributing

Cacophony intentionally uses only Node.js 24 built-ins at runtime and in tests.
Before adding a package, demonstrate why the standard library cannot provide a
small, secure, maintainable implementation.

## Validate changes

```bash
node --check src/index.js
node --test
git diff --check
```

Changes to the public action contract must update `action.yml`, `README.md`, and
tests together. Security-sensitive tool changes require tests for traversal,
symlink escape, output bounds, and secret handling as applicable.

## Releases

Create immutable semantic-version tags for releases. Move the major `v1` tag to
the same commit after a `1.x.y` release is approved. Consumers with stricter
supply-chain requirements can pin the immutable tag or commit SHA.
