Review this pull request for material performance, cost, and scalability
regressions.

Examine changed hot paths, algorithmic complexity, repeated I/O, buffering,
unbounded collections, concurrency, retries, rate limits, payload growth, and
resource cleanup. Evaluate realistic production scale using constraints and
usage patterns evidenced in the repository.

Report only issues likely to cause meaningful latency, throughput, memory,
reliability, or cost impact. Cite exact file and line evidence, describe the
triggering workload, and recommend a proportionate fix. Do not suggest
micro-optimizations without measurable value.
