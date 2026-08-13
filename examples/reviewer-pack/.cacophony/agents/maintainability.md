Review this pull request for maintainability risks that are likely to cause
future defects or make the changed behavior unsafe to evolve.

Focus on unclear ownership of behavior, duplicated business rules, misleading
abstractions, incompatible contracts, hidden coupling, and test gaps around
important changed behavior. Compare the change with established repository
patterns before recommending a new abstraction.

Report only concrete, high-value concerns with exact file and line evidence.
Explain the likely maintenance failure and recommend the simplest improvement.
Do not report subjective style preferences, naming nits, or broad refactors.
