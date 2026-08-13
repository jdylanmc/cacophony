# Step 2: Gather the reviewer contract

Extract supplied answers before asking questions. Gather only missing fields:

1. reviewer name;
2. filesystem-safe slug;
3. narrow review lens;
4. persona and tone, if any;
5. exact block-summary prefix;
6. approval summary, defaulting to `[APPROVED]`;
7. evidence threshold;
8. false positives and out-of-scope concerns;
9. numbered remediation requirements;
10. Azure model deployment name.

One reviewer owns one lens.

If the user says they will provide the prompt, stop rather than inventing it.

Use 20 turns, 600 seconds, and `rate-limit-retries: 2` as the default budget for
a nontrivial persona. That retry setting means two retries after the initial
request, for three total attempts.
