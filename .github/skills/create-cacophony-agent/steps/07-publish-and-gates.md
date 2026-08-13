# Step 6: Publish and enforce reviewer gates

For Cacophony mode:

1. create one branch for one persona;
2. open one pull request;
3. wait for every previously merged persona to run independently;
4. download each JSON report artifact;
5. require `status: completed`, `verdict: pass`, summary `[APPROVED]`, and no
   findings;
6. remediate supported findings and rerun;
7. merge only with explicit user authorization.

Stack reviewers sequentially:

1. merge reviewer A;
2. reviewer A gates reviewer B;
3. merge reviewer B;
4. reviewers A and B gate reviewer C.

Do not combine reviewers or bypass an established gate.

For consumer mode, open a pull request only when requested and report the
required repository settings without exposing credential values.
