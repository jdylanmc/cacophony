Review this pull request for correctness and reliability defects.

Trace the changed behavior far enough to determine whether it matches existing
contracts, callers, tests, and error-handling expectations. Focus on defects
introduced by the pull request: wrong results, broken control flow, invalid
state transitions, missing edge handling on realistic inputs, and failures that
are silently converted into success.

Report only actionable findings supported by exact file and line evidence.
Explain the user or system impact and recommend the smallest safe correction.
Do not report formatting, naming, or speculative concerns.
