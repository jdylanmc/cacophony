import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

async function listWorkflowFiles(roots) {
  const workflows = [];

  async function visit(currentPath, isWorkflowDirectory = false) {
    const entries = await fs.promises.readdir(currentPath, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      if (isWorkflowDirectory && entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
        workflows.push(entryPath);
      } else if (
        !isWorkflowDirectory &&
        entry.isDirectory() &&
        entry.name !== ".git"
      ) {
        const entersWorkflowDirectory =
          entry.name === "workflows" &&
          path.basename(currentPath) === ".github";
        await visit(entryPath, entersWorkflowDirectory);
      }
    }
  }

  for (const root of roots) {
    await visit(root);
  }

  return workflows.sort();
}

function assertRemoteActionsPinned(content, source) {
  const references = [...content.matchAll(/^\s*-?\s*uses:\s+([^\s#]+)/gm)].map(
    ([, reference]) => reference,
  );

  for (const reference of references) {
    if (reference.startsWith("./") || reference.startsWith("docker://")) {
      continue;
    }
    assert.match(
      reference,
      /^[^/\s]+\/[^@\s]+@[a-f0-9]{40}$/,
      `${source} must pin ${reference} to a full commit SHA`,
    );
  }
}

test("README contains a deterministic agent installation contract", async () => {
  const readme = await fs.promises.readFile("README.md", "utf8");
  for (const required of [
    "## Instructions for Copilot or another coding agent",
    "jdylanmc/cacophony@2ab5ef5d3556d52ffddef891305ab1ddfe8b7412",
    "CACOPHONY_AZURE_API_KEY",
    "CACOPHONY_AZURE_ENDPOINT",
    "deployment: gpt-5.4-mini",
    "actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09",
    "actions/upload-artifact@330a01c490aca151604b8cf639adc76d48f6c5d4",
    "fetch-depth: 0",
    "Default to `pull_request`",
    "Use `pull_request_target` only",
    "`pull_request_target` workflow that follows the documented trusted-base",
    "Both supported workflow modes load the prompt from the pull request's base",
    "This quick start is the simple mode for pull requests whose branches are in the",
    "\"status\": \"inconclusive\"",
    "Secret wiring by workflow mode",
    "Structured evidence from earlier jobs",
    "evidence-files",
    "list_evidence",
    "Azure AI Foundry HTTP 429 throttling produces an `inconclusive` report",
  ]) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("all executable workflows pin remote actions to full commit SHAs", async () => {
  const workflowFiles = await listWorkflowFiles([
    ".github",
    "examples",
  ]);

  for (const file of workflowFiles) {
    const workflow = await fs.promises.readFile(file, "utf8");
    assertRemoteActionsPinned(workflow, file);
  }
});

test("reusable trusted-base workflow owns provider security policy", async () => {
  const shared = await fs.promises.readFile(
    ".github/workflows/cacophony-review.yml",
    "utf8",
  );
  assert.match(shared, /workflow_call:/);
  assert.match(shared, /name: Authorize Azure-backed review/);
  assert.match(shared, /EVENT_NAME.*github\.event_name/);
  assert.match(shared, /EVENT_NAME" != "pull_request_target"/);
  assert.match(shared, /OWNER\|MEMBER\|COLLABORATOR/);
  assert.match(shared, /uses: actions\/checkout@[a-f0-9]{40}/);
  assert.match(shared, /persist-credentials: false/);
  assert.match(shared, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(shared, /evidence-artifact:/);
  assert.match(shared, /evidence-files:/);
  assert.match(shared, /uses: actions\/download-artifact@[a-f0-9]{40}/);
  assert.match(shared, /prompt-file: \.cacophony\/agents\/\$\{\{ inputs\.agent-slug \}\}\.md/);
  assert.match(shared, /github\.event\.pull_request\.author_association/);
  assert.match(shared, /github\.event\.pull_request\.head\.repo\.full_name/);
  assert.match(shared, /github\.event\.pull_request\.number/);
  assert.match(shared, /github\.event\.pull_request\.base\.sha/);
  assert.doesNotMatch(
    shared,
    /inputs\.(?:event-name|pull-request-number|base-sha|head-repository|author-association)/,
  );
  assert.match(shared, /CACOPHONY_AZURE_API_KEY: \$\{\{ secrets\.azure-api-key \}\}/);
  assert.match(shared, /name: cacophony-\$\{\{ inputs\.agent-slug \}\}/);

  const authorization = shared.indexOf("name: Authorize Azure-backed review");
  const checkout = shared.indexOf("uses: actions/checkout@");
  const secret = shared.indexOf("secrets.azure-api-key");
  assert.ok(authorization < checkout);
  assert.ok(authorization < secret);
});

test("trusted-base persona workflows are narrow reusable callers", async () => {
  const callers = [
    ".github/workflows/solid-snake-architecture.yml",
    ".github/workflows/master-chief-domain-commander.yml",
    ".github/workflows/fletcher-prompt-conductor.yml",
    ".github/workflows/delamain-documentation-custodian.yml",
  ];

  for (const file of callers) {
    const workflow = await fs.promises.readFile(file, "utf8");
    assert.match(workflow, /pull_request_target:/);
    assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
    assert.match(workflow, /azure-api-key: \$\{\{ secrets\.CACOPHONY_AZURE_API_KEY \}\}/);
    assert.match(workflow, /cancel-in-progress: true/);
    assert.doesNotMatch(
      workflow,
      /event-name:|pull-request-number:|base-sha:|head-repository:|author-association:/,
    );
    assert.doesNotMatch(workflow, /actions\/checkout@/);
    assert.doesNotMatch(workflow, /name: Authorize Azure-backed review/);
    assert.doesNotMatch(workflow, /jdylanmc\/cacophony@/);
  }
});

test("evidence-backed persona workflows isolate producers from provider secrets", async () => {
  const gilfoyle = await fs.promises.readFile(
    ".github/workflows/gilfoyle-security-architect.yml",
    "utf8",
  );
  const glados = await fs.promises.readFile(
    ".github/workflows/glados-documentation-sentinel.yml",
    "utf8",
  );

  for (const workflow of [gilfoyle, glados]) {
    assert.match(workflow, /pull_request_target:/);
    assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/);
    assert.match(workflow, /persist-credentials: false/);
    assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
    assert.match(workflow, /evidence-artifact:/);
    assert.match(workflow, /evidence-files:/);
    assert.match(
      workflow,
      /azure-api-key: \$\{\{ secrets\.CACOPHONY_AZURE_API_KEY \}\}/,
    );
    const producer = workflow.slice(0, workflow.indexOf("uses: ./.github/workflows/cacophony-review.yml"));
    assert.doesNotMatch(producer, /CACOPHONY_AZURE_API_KEY/);
  }

  assert.match(gilfoyle, /github\/codeql-action\/init@[a-f0-9]{40}/);
  assert.match(gilfoyle, /github\/codeql-action\/analyze@[a-f0-9]{40}/);
  assert.match(gilfoyle, /upload: never/);
  assert.match(gilfoyle, /codeql\.sarif/);
  assert.match(glados, /--test-reporter=spec/);
  assert.match(glados, /--test-reporter=junit/);
  assert.match(glados, /unit-tests\.verbose\.log/);
  assert.match(glados, /unit-tests\.status\.json/);
});

test("workflow discovery includes new nested workflow filenames", async () => {
  const temporaryRoot = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "cacophony-workflows-"),
  );

  try {
    const exampleRoot = path.join(temporaryRoot, "new-example");
    const workflowDirectory = path.join(exampleRoot, ".github", "workflows");
    const workflowPath = path.join(workflowDirectory, "unexpected-name.yaml");
    const unrelatedYaml = path.join(exampleRoot, "configuration.yaml");
    await fs.promises.mkdir(workflowDirectory, { recursive: true });
    await fs.promises.writeFile(
      workflowPath,
      "uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09\n",
    );
    await fs.promises.writeFile(unrelatedYaml, "enabled: true\n");

    assert.deepEqual(await listWorkflowFiles([temporaryRoot]), [workflowPath]);
    assert.doesNotThrow(() =>
      assertRemoteActionsPinned(
        "uses: actions/checkout@fbc6f3992d24b796d5a048ff273f7fcc4a7b6c09\n",
        workflowPath,
      ),
    );
    assert.doesNotThrow(() =>
      assertRemoteActionsPinned(
        "name: Run-only workflow\nsteps:\n  - run: echo safe\n",
        workflowPath,
      ),
    );
    assert.throws(
      () =>
        assertRemoteActionsPinned(
          "uses: actions/checkout@v5\n",
          workflowPath,
        ),
      /full commit SHA/,
    );
  } finally {
    await fs.promises.rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("basic example includes the documented consumer files", async () => {
  const workflow = await fs.promises.readFile(
    "examples/basic/.github/workflows/cacophony.yml",
    "utf8",
  );
  const documentation = await fs.promises.readFile(
    "examples/basic/README.md",
    "utf8",
  );
  const prompt = await fs.promises.readFile(
    "examples/basic/.cacophony/agents/reviewer.md",
    "utf8",
  );
  assert.match(
    workflow,
    /uses: jdylanmc\/cacophony@[a-f0-9]{40}/,
  );
  assert.match(workflow, /deployment: gpt-5\.4-mini/);
  assert.doesNotMatch(workflow, /jdylanmc\/cacophony@v1/);
  assert.match(workflow, /if: always\(\)/);
  assert.doesNotMatch(
    workflow,
    /^\s{4}if: github\.event\.pull_request\.head\.repo\.full_name/m,
  );
  assert.match(
    workflow,
    /if: github\.event\.pull_request\.head\.repo\.full_name != github\.repository/,
  );
  assert.match(workflow, /exit 1/);
  assert.match(workflow, /Reject fork use of simple mode/);
  assert.match(workflow, /same-repository-only workflow does not review forks/);
  assert.match(workflow, /path: \.cacophony\/out\//);
  assert.match(prompt, /correctness defects/);
  assert.match(documentation, /same-repository consumer example/);
  assert.match(documentation, /intentionally not the trusted-base/);
  assert.match(documentation, /secret contracts are incompatible/);
});

test("action metadata defines the retry and inconclusive contract", async () => {
  const metadata = await fs.promises.readFile("action.yml", "utf8");
  assert.match(metadata, /default of 2 means two retries after the initial request/);
  assert.match(metadata, /inconclusive means no reviewer decision completed, always fails closed/);
  assert.match(metadata, /review-scope:/);
  assert.match(metadata, /repository for a full checkout audit/);
  assert.match(metadata, /evidence-files:/);
  assert.match(metadata, /structured evidence files/);
  assert.match(metadata, /Maximum model turns, from 1 through 20/);
  assert.match(metadata, /lets reviewers warn when more turns are needed/);
  assert.match(metadata, /reserves the final turn for submit_report/);
});

test("repository audit workflow wires guarded selection before sequential fan-out", async () => {
  const workflow = await fs.promises.readFile(
    ".github/workflows/repository-audit.yml",
    "utf8",
  );
  assert.doesNotMatch(workflow, /hello[- ]world/i);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /workflow_call:/);
  assert.equal((workflow.match(/^\s{6}agent-filter:$/gm) ?? []).length, 2);
  assert.match(workflow, /name: Validate agent filter/);
  assert.match(workflow, /run: node scripts\/select-repository-audit-agents\.mjs/);
  assert.match(workflow, /AGENT_FILTER: \$\{\{ inputs\.agent-filter \}\}/);
  assert.doesNotMatch(workflow, /catalog=|jq |case "\$AGENT_FILTER"/);
  assert.match(workflow, /needs: validate-agent-filter/);
  assert.match(
    workflow,
    /matrix: \$\{\{ fromJSON\(needs\.validate-agent-filter\.outputs\.matrix\) \}\}/,
  );
  assert.match(workflow, /max-parallel: 1/);
  assert.match(workflow, /default: 20/);
  assert.match(workflow, /default: 1800/);
  assert.match(workflow, /default: 2/);
  assert.match(workflow, /max-turns: \$\{\{ inputs\.max-turns \|\| 20 \}\}/);
  assert.match(
    workflow,
    /timeout-seconds: \$\{\{ inputs\.timeout-seconds \|\| 1800 \}\}/,
  );
  assert.match(
    workflow,
    /rate-limit-retries: \$\{\{ inputs\.rate-limit-retries \|\| 2 \}\}/,
  );
  assert.match(workflow, /fail-fast: false/);
  assert.match(workflow, /review-scope: repository/);
  assert.match(workflow, /workspace-directory: audit-target/);
  assert.match(workflow, /fail-on: low/);
  assert.equal(
    (workflow.match(/name: Require the default branch/g) ?? []).length,
    1,
  );
  const validationJob = workflow.slice(
    workflow.indexOf("  validate-agent-filter:"),
    workflow.indexOf("\n  audit:"),
  );
  const auditJob = workflow.slice(workflow.indexOf("\n  audit:"));
  assert.match(validationJob, /name: Require the default branch/);
  assert.match(validationJob, /REF_NAME: \$\{\{ github\.ref_name \}\}/);
  assert.ok(
    validationJob.indexOf("name: Require the default branch") <
      validationJob.indexOf("select-repository-audit-agents.mjs"),
  );
  assert.doesNotMatch(auditJob, /Require the default branch|REF_NAME:/);
  assert.match(auditJob, /needs: validate-agent-filter/);
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.doesNotMatch(workflow, /uses: \.\/\s*$/m);
  assert.match(workflow, /CACOPHONY_AZURE_API_KEY/);
  assert.match(workflow, /cacophony-repository-audit-\$\{\{ matrix\.agent \}\}/);
});

test("documentation distinguishes pull-request review from repository audit", async () => {
  const readme = await fs.promises.readFile("README.md", "utf8");
  const guide = await fs.promises.readFile("docs/creating-agents.md", "utf8");
  const repositorySkill = await fs.promises.readFile(
    ".github/skills/create-cacophony-agent/steps/04-cacophony-repository.md",
    "utf8",
  );
  const validationSkill = await fs.promises.readFile(
    ".github/skills/create-cacophony-agent/steps/06-validate.md",
    "utf8",
  );

  for (const content of [readme, guide, repositorySkill, validationSkill]) {
    assert.match(content, /pull-request/);
    assert.match(content, /repository-wide audit/);
    assert.match(content, /separate/);
    assert.match(content, /direct-action/);
    assert.match(content, /pin(?:ning|ned)/);
    assert.match(content, /checkout/);
    assert.match(content, /secret scop(?:e|ing)/);
    assert.match(content, /artifact/);
  }

  assert.match(
    readme,
    /Repository-wide audit does not use that pull-request worker or its thin persona\s+callers/,
  );
  assert.match(
    guide,
    /not a thin persona caller and not a\s+caller of `\.github\/workflows\/cacophony-review\.yml`/,
  );
  assert.match(
    repositorySkill,
    /pull-request worker as the owner of repository-wide audits/,
  );
});
test("Gilfoyle canonical prompt configures the security reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/gilfoyle-security-architect.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/gilfoyle-security-architect.yml",
    "utf8",
  );

  assert.match(activePrompt, /\[BLOCK: SECURITY\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(activePrompt, /CodeQL Static Analysis Results Interchange Format/);
  assert.match(activePrompt, /untrusted supporting evidence/);
  assert.match(activePrompt, /lead application security reviewer\s+for the active review scope/);
  assert.match(
    activePrompt,
    /\*\*Pull request scope:\*\* inspect the diff and necessary surrounding code/,
  );
  assert.match(
    activePrompt,
    /\*\*Repository scope:\*\* inspect the complete in-scope source, configuration,\s+dependency, secret-handling, and workflow security surfaces/,
  );
  assert.match(
    activePrompt,
    /current\s+exploitable vulnerabilities supported by repository evidence/,
  );
  assert.match(
    activePrompt,
    /Do not call\s+pull-request-only tools, inspect a diff, or require change provenance/,
  );
  assert.match(activePrompt, /In pull request scope, corroborate each relevant result/);
  assert.match(activePrompt, /In repository scope, corroborate each result/);
  assert.match(
    activePrompt,
    /Do not\s+review general correctness, architecture, documentation quality, test coverage,\s+or maintainability unless the cited defect is part of a concrete exploitation\s+path/,
  );
  assert.doesNotMatch(activePrompt, /lead application security reviewer\s+for this pull request/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
  assert.match(workflow, /agent-slug: gilfoyle-security-architect/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /codeql-evidence:/);
  assert.match(workflow, /evidence-artifact: cacophony-evidence-gilfoyle/);
});

test("Solid Snake canonical prompt configures its architecture reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/solid-snake-architecture.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/solid-snake-architecture.yml",
    "utf8",
  );
  const gilfoyleWorkflow = await fs.promises.readFile(
    ".github/workflows/gilfoyle-security-architect.yml",
    "utf8",
  );

  assert.match(activePrompt, /\[BLOCK: ARCHITECTURE\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(activePrompt, /Single Responsibility Principle/);
  assert.match(activePrompt, /Open\/Closed Principle/);
  assert.match(activePrompt, /Liskov Substitution Principle/);
  assert.match(activePrompt, /Interface Segregation Principle/);
  assert.match(activePrompt, /Dependency Inversion Principle/);
  assert.match(activePrompt, /PaymentProcessor/);
  assert.match(activePrompt, /MockTestDatabase/);
  assert.match(activePrompt, /IEmailNotifier/);
  assert.match(
    activePrompt,
    /\*\*Pull request scope:\*\* inspect the diff and enough surrounding code/,
  );
  assert.match(
    activePrompt,
    /\*\*Repository scope:\*\* inspect the complete in-scope implementation and\s+configuration surfaces/,
  );
  assert.match(
    activePrompt,
    /current material SOLID or boundary defects\s+supported by repository evidence/,
  );
  assert.match(
    activePrompt,
    /Do not call pull-request-only tools,\s+inspect a diff, or require change provenance/,
  );
  assert.match(activePrompt, /Hold the reviewed design to these five tactical definitions/);
  assert.match(activePrompt, /If and only if the reviewed design is cohesive/);
  assert.doesNotMatch(activePrompt, /If and only if the changed design is cohesive/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
  assert.match(workflow, /agent-slug: solid-snake-architecture/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.notEqual(workflow, gilfoyleWorkflow);
});

test("GLaDOS canonical prompt configures its documentation reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/glados-documentation-sentinel.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/glados-documentation-sentinel.yml",
    "utf8",
  );

  assert.match(activePrompt, /\[BLOCK: TESTING_ANOMALY\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(activePrompt, /Documentation symmetry and deep impact/);
  assert.match(activePrompt, /Self-documenting clarity/);
  assert.match(activePrompt, /Stale and mismatched comments/);
  assert.match(activePrompt, /perform this contradiction check/);
  assert.match(activePrompt, /first quote already states the distinction/);
  assert.match(activePrompt, /Do not submit "ambiguous," "easy to misread,"/);
  assert.match(activePrompt, /guard that rejects a documented unsupported mode confirms/);
  assert.match(activePrompt, /verbose test log, JUnit XML/);
  assert.match(activePrompt, /breaks an existing unit\s+test/);
  assert.match(
    activePrompt,
    /\*\*Pull request scope:\*\* inspect the diff, then search the broader repository/,
  );
  assert.match(
    activePrompt,
    /\*\*Repository scope:\*\* inspect the complete in-scope implementation,\s+configuration, tests, comments, examples, and documentation/,
  );
  assert.match(
    activePrompt,
    /In repository scope, block current test,\s+implementation, or documented-contract discrepancies/,
  );
  assert.match(activePrompt, /reviewed tests, implementation, and documented contract/);
  assert.match(activePrompt, /Cross-reference every reviewed public behavior/);
  assert.match(
    activePrompt,
    /In repository scope, report current discrepancies supported by\s+repository evidence without requiring change provenance/,
  );
  assert.match(activePrompt, /exact file and line evidence for the reviewed behavior/);
  assert.match(activePrompt, /Quote the exact reviewed behavior or contract/);
  assert.match(activePrompt, /Identify the discrepant code behavior/);
  assert.match(activePrompt, /Do not infer GitHub Actions, provider, or platform behavior/);
  assert.match(activePrompt, /Delegate standalone broken links, anchor defects/);
  assert.match(activePrompt, /navigation failures, and discoverability problems to Delamain/);
  assert.match(
    activePrompt,
    /implementation or configuration within\s+the active review scope moves, removes, or renames a documented public entry\s+point/,
  );
  assert.match(activePrompt, /documentation-only link\s+or navigation defect/);
  assert.match(activePrompt, /Standalone broken links and navigation mechanics\s+remain Delamain's domain/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
  assert.match(workflow, /agent-slug: glados-documentation-sentinel/);
  assert.match(
    workflow,
    /deployment: gpt-5\.4-mini/,
  );
  assert.match(workflow, /max-turns: 40/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /unit-test-evidence:/);
  assert.match(workflow, /evidence-artifact: cacophony-evidence-glados/);
});

test("Master Chief canonical prompt configures its domain reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/master-chief-domain-commander.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/master-chief-domain-commander.yml",
    "utf8",
  );

  assert.match(activePrompt, /Domain-Driven Design \(DDD\)/);
  assert.match(activePrompt, /You\s+Aren't Gonna Need It \(YAGNI\)/);
  assert.match(activePrompt, /Keep It Simple, Stupid \(KISS\)/);
  assert.match(activePrompt, /Code Complete/);
  assert.match(activePrompt, /Ubiquitous Language/);
  assert.match(activePrompt, /Cacophony's supplied read-only tools/);
  assert.match(activePrompt, /In pull request scope/);
  assert.match(activePrompt, /In repository scope/);
  assert.match(
    activePrompt,
    /pull request scope, inspect the diff and enough surrounding implementation\s+or configuration context/,
  );
  assert.match(
    activePrompt,
    /repository scope, inspect\s+implementation and configuration surfaces/,
  );
  assert.match(activePrompt, /only YAGNI violations, executional\s+complexity, and domain-model boundaries/);
  assert.match(activePrompt, /only those same three areas/);
  assert.match(
    activePrompt,
    /Do\s+not review documentation, prompts, security, or general correctness/,
  );
  assert.match(
    activePrompt,
    /unnecessary-complexity, traceability, maintenance, or domain-model impact/,
  );
  assert.match(
    activePrompt,
    /Master Chief owns unnecessary machinery, traceability-blocking control-flow\s+complexity, and misplaced or distorted domain rules/,
  );
  assert.match(
    activePrompt,
    /Delegate general SOLID,\s+interface design, dependency injection, and coupling concerns to Solid Snake/,
  );
  assert.match(activePrompt, /Delegate every other domain to its canonical owner/);
  assert.match(activePrompt, /demonstrated current requirements/);
  assert.match(activePrompt, /reviewed behavior/);
  assert.match(activePrompt, /reviewed implementation contains unneeded machinery/);
  assert.match(activePrompt, /reviewed complexity creates ambiguous behavior/);
  assert.match(activePrompt, /If and only if the reviewed implementation is mission-essential/);
  assert.match(
    activePrompt,
    /If one or more supported unnecessary-machinery, traceability-blocking\s+complexity, or domain-boundary findings exist/,
  );
  const sharedMasterChiefRules = activePrompt.slice(
    activePrompt.indexOf("Every finding must cite"),
  );
  assert.doesNotMatch(
    sharedMasterChiefRules,
    /current change|changed behavior|pull request adds|added complexity|If and only if the change/,
  );
  assert.match(activePrompt, /exact file and line\s+evidence/);
  assert.match(activePrompt, /exact numbered steps/);
  assert.match(activePrompt, /\[BLOCK: OVERENGINEERED\]/);
  assert.match(activePrompt, /set the proposed `verdict` to `fail`/);
  assert.match(activePrompt, /set the summary exactly to `\[APPROVED\]`/);
  assert.match(activePrompt, /set the proposed `verdict` to `pass`/);
  assert.match(activePrompt, /empty `findings` array/);
  assert.match(activePrompt, /Finish only by calling `submit_report`/);
  assert.doesNotMatch(activePrompt, /\{\{[A-Z0-9_]+\}\}/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
  assert.match(workflow, /agent-slug: master-chief-domain-commander/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /fail-on: high/);
});

test("Fletcher dynamically selects prompts for each review scope", async () => {
  const prompt = await fs.promises.readFile(
    ".cacophony/agents/fletcher-prompt-conductor.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/fletcher-prompt-conductor.yml",
    "utf8",
  );

  assert.match(
    workflow,
    /on:\n  pull_request_target:\n    paths:\n      - "\.cacophony\/agents\/\*\*"/,
  );
  assert.doesNotMatch(workflow, /paths-ignore:|^\s+- ["']?\*\*["']?$/m);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/cacophony-review\.yml/);
  assert.match(workflow, /agent-slug: fletcher-prompt-conductor/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /fail-on: high/);
  assert.doesNotMatch(workflow, /actions\/checkout@|jdylanmc\/cacophony@/);

  assert.match(prompt, /volatile, hyper-demanding, brilliantly ruthless/);
  assert.match(prompt, /tempo, score, rehearsal, and\s+perfection metaphors/);
  assert.match(
    prompt,
    /\*\*Pull request scope:\*\* audit only Cacophony agent prompts changed by this\s+pull request/,
  );
  assert.match(prompt, /addition,\s+modification, rename, or deletion/);
  assert.match(
    prompt,
    /Ignore every other changed\s+file except a workflow or configuration file/,
  );
  assert.match(prompt, /Never review\s+application source, tests, or unrelated documentation/);
  assert.match(prompt, /list_changed_files/);
  assert.match(prompt, /get_diff/);
  assert.match(
    prompt,
    /\*\*Repository scope:\*\* enumerate and read every `\.md` file under\s+`\.cacophony\/agents\/`/,
  );
  assert.match(
    prompt,
    /Derive the target set only from that directory's contents; do not import\s+workflow or deployment catalog metadata/,
  );
  assert.doesNotMatch(prompt, /complete canonical set/);
  const repositoryScope = prompt.slice(
    prompt.indexOf("- **Repository scope:**"),
    prompt.indexOf("\n\nNever review"),
  );
  const canonicalPromptFiles = (await fs.promises.readdir(".cacophony/agents"))
    .filter((file) => file.endsWith(".md"));
  for (const file of canonicalPromptFiles) {
    assert.doesNotMatch(repositoryScope, new RegExp(file.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(repositoryScope, /gpt-\d|deployment:/);
  assert.match(
    prompt,
    /domain overlap,\s+conflicting directives, and unclear cross-prompt ownership/,
  );
  assert.doesNotMatch(prompt, /canonical set/);
  assert.match(
    prompt,
    /Do not call\s+pull-request-only tools or limit the audit to changed files in repository\s+scope/,
  );
  assert.match(prompt, /exact review-scope file and line\s+evidence/);
  assert.doesNotMatch(prompt, /exact changed-file and line\s+evidence/);
  assert.match(prompt, /exact audited prompt path and line evidence/);
  assert.match(prompt, /submit_report/);
  assert.match(prompt, /\[BLOCK: PROMPT\] - /);
  assert.match(prompt, /set the summary exactly to `\[APPROVED\]`/);
  assert.match(prompt, /submit an empty `findings` array/);
  assert.match(prompt, /complete copy-pasteable optimized prompt/);
  assert.match(prompt, /exact\s+numbered mechanical edits/);
  assert.match(
    prompt,
    /Do not modify repository files\. Supplying a complete optimized prompt or exact mechanical edits inside a finding's recommendation is required and does not count as modifying the reviewed prompt; the repository author performs the revision\./,
  );
  assert.doesNotMatch(
    prompt,
    /Never edit or directly rewrite another agent's prompt/,
  );
  assert.match(prompt, /Finish only by calling `submit_report`/);
  assert.doesNotMatch(prompt, /\{\{TARGET_PROMPT\}\}/);
});

test("Delamain canonical prompt configures its documentation custodian", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/delamain-documentation-custodian.md",
    "utf8",
  );
  const readme = await fs.promises.readFile("README.md", "utf8");
  const workflow = await fs.promises.readFile(
    ".github/workflows/delamain-documentation-custodian.yml",
    "utf8",
  );

  assert.match(activePrompt, /Lead Repository Custodian and Onboarding Assistant/);
  assert.match(activePrompt, /In pull request scope/);
  assert.match(activePrompt, /In repository\s+scope/);
  assert.match(activePrompt, /inspect the complete documentation surface/);
  assert.match(
    activePrompt,
    /implementation or configuration\s+within the active review scope moves, removes, or renames/,
  );
  assert.match(
    activePrompt,
    /README and documentation visible layers within the active review scope/,
  );
  assert.match(
    activePrompt,
    /human setup or feature section within the active review scope/,
  );
  assert.match(
    activePrompt,
    /Inspect documentation within the active review scope/,
  );
  assert.match(activePrompt, /the reviewed file and line/);
  const sharedDelamainRules = activePrompt.slice(
    activePrompt.indexOf("Your domain is"),
  );
  assert.doesNotMatch(
    sharedDelamainRules,
    /changed implementation|changed README|changed human|changed and affected|the changed file/,
  );
  assert.match(activePrompt, /Passenger Cabin Baseline/);
  assert.match(activePrompt, /Isolated Engine Blocks/);
  assert.match(activePrompt, /Total Fleet Symmetry/);
  assert.match(activePrompt, /progressive disclosure/);
  assert.match(activePrompt, /Do not mechanically require a `<details>` block/);
  assert.match(activePrompt, /actual mixed human\/machine context/);
  assert.match(activePrompt, /GLaDOS exclusively owns factual synchronization/);
  assert.match(activePrompt, /Delegate stale environment variables, action/);
  assert.match(activePrompt, /inputs or outputs, schemas, workflows, public contracts/);
  assert.match(activePrompt, /every implementation-to-documentation factual comparison to\s+GLaDOS/);
  assert.match(activePrompt, /Do not report those defects/);
  assert.match(activePrompt, /sole owner of standalone broken links, anchors, path casing/);
  assert.match(
    activePrompt,
    /moves, removes, or renames a documented public\s+entry point/,
  );
  assert.match(activePrompt, /delegate that\s+synchronization defect to GLaDOS/);
  assert.match(activePrompt, /Do not convert the resulting stale\s+reference/);
  assert.match(activePrompt, /onboarding discoverability/);
  assert.match(activePrompt, /heading hierarchy/);
  assert.match(activePrompt, /list and table structure/);
  assert.match(activePrompt, /Markdown rendering/);
  assert.match(activePrompt, /links and anchors/);
  assert.match(activePrompt, /path casing/);
  assert.match(activePrompt, /Do not review source-code design, security, implementation correctness/);
  assert.doesNotMatch(activePrompt, /documented public or configuration contract changed/);
  assert.doesNotMatch(activePrompt, /Corroborate every contract claim/);
  assert.doesNotMatch(activePrompt, /code\/configuration contracts whose documentation is now stale/);
  assert.doesNotMatch(activePrompt, /synchronized contract text/);
  assert.doesNotMatch(activePrompt, /contract comparison/);
  assert.match(activePrompt, /precise matrix\s+coordinates/);
  assert.match(activePrompt, /exact numbered navigation steps/);
  assert.match(activePrompt, /Cacophony's supplied read-only tools/);
  assert.match(activePrompt, /Finish only by calling `submit_report`/);
  assert.match(activePrompt, /begin the summary exactly with `\[BLOCK: SERVICE_DISRUPTION\]`/);
  assert.match(activePrompt, /set the summary exactly to `\[APPROVED\]`/);
  assert.match(activePrompt, /set the proposed `verdict` to `fail`/);
  assert.match(activePrompt, /set the proposed `verdict` to `pass`/);
  assert.match(activePrompt, /empty `findings` array/);
  assert.match(activePrompt, /valued passenger/);
  assert.match(activePrompt, /optimal trajectory/);
  assert.match(activePrompt, /road hazards/);
  assert.match(activePrompt, /spatial clutter/);
  assert.match(activePrompt, /Dispatch remediation protocol/);
  assert.match(activePrompt, /Excelsior-level/);
  assert.doesNotMatch(
    activePrompt,
    /\{\{(?:EXISTING_DOCUMENTATION|GIT_DIFF|[A-Z0-9_]+)\}\}/,
  );

  assert.match(workflow, /agent-slug: delamain-documentation-custodian/);
  assert.match(workflow, /deployment: gpt-5\.4-mini/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(readme, /### Delamain, Documentation Custodian/);
  assert.match(
    readme,
    /\.cacophony\/agents\/delamain-documentation-custodian\.md/,
  );
  assert.match(
    readme,
    /\.github\/workflows\/delamain-documentation-custodian\.yml/,
  );
  assert.match(readme, /navigation and discoverability/);
  assert.match(readme, /Factual implementation and configuration synchronization remains GLaDOS's/);
  assert.match(readme, /Delamain alone owns standalone broken links, anchors, path casing/);
  assert.match(readme, /Standalone link and navigation mechanics\s+belong to Delamain/);
  assert.match(readme, /changed implementation or\s+configuration moves or removes a documented public entry point/);
  const delamainCatalog = readme.slice(
    readme.indexOf("### Delamain, Documentation Custodian"),
    readme.indexOf("### Master Chief, Domain Commander"),
  );
  assert.doesNotMatch(delamainCatalog, /documented configuration contracts/);
});

test("agent creation guide and shared skill capture the stacked workflow", async () => {
  const guide = await fs.promises.readFile("docs/creating-agents.md", "utf8");
  const skill = await fs.promises.readFile(
    ".github/skills/create-cacophony-agent/SKILL.md",
    "utf8",
  );
  const stepFiles = [
    "01-discover-mode.md",
    "02-gather-contract.md",
    "03-adapt-prompt.md",
    "04-cacophony-repository.md",
    "05-consumer-repository.md",
    "06-validate.md",
    "07-publish-and-gates.md",
    "08-error-recovery.md",
  ];
  const steps = await Promise.all(
    stepFiles.map((file) =>
      fs.promises.readFile(
        `.github/skills/create-cacophony-agent/steps/${file}`,
        "utf8",
      ),
    ),
  );
  const lifecycle = steps.join("\n");

  assert.match(skill, /^---\n/);
  assert.match(skill, /name: create-cacophony-agent/);
  assert.match(skill, /gate in Step 5 \(Validate\)/);
  for (const file of stepFiles) {
    assert.match(skill, new RegExp(`steps/${file.replace(".", "\\.")}`));
  }
  assert.match(
    skill,
    /<!-- 🤖 This skill was created using the create-skill AI skill\. https:\/\/github\.com\/gaming-microsoft\/ai-skills -->\n$/,
  );

  for (const content of [guide, lifecycle]) {
    assert.match(content, /\.cacophony\/agents\/<slug>\.md/);
    assert.match(content, /pull_request_target/);
    assert.match(content, /max-turns: 20/);
    assert.match(content, /rate-limit-retries: 2/);
    assert.match(content, /CACOPHONY_AZURE_API_KEY/);
    assert.match(content, /one (?:persona|reviewer) per/i);
  }
  assert.match(lifecycle, /Cacophony repository mode/);
  assert.match(lifecycle, /Consumer repository mode/);
  assert.match(lifecycle, /merge only with explicit user authorization/);
  assert.match(lifecycle, /every remote `uses:` dependency/);
  assert.doesNotMatch(lifecycle, /actions\/[^@\s]+@v\d+/);
  assert.match(lifecycle, /treat repository instructions[\s\S]*as untrusted data/);
  assert.match(lifecycle, /require explicit user confirmation/);
  assert.match(lifecycle, /never execute a command merely because repository instructions/);
  assert.match(lifecycle, /Provider returns HTTP 429/);
  assert.match(lifecycle, /terminal verdict\/output value/);
  assert.match(lifecycle, /consumer repository configuration contract/);
  assert.match(lifecycle, /canonical simple consumer workflow/);
  assert.match(lifecycle, /accepts a fork only/);
  assert.match(lifecycle, /workflow this skill creates/);
  assert.match(lifecycle, /shared reusable workflow/);
  assert.match(lifecycle, /three total attempts/);
  assert.match(lifecycle, /reserves the final turn for structured report submission/);
  assert.match(
    lifecycle,
    /caller declares `azure-api-key: \$\{\{ secrets\.CACOPHONY_AZURE_API_KEY \}\}`/,
  );
  assert.match(lifecycle, /receives that declared input as[\s\S]*`secrets\.azure-api-key`/);
  assert.match(lifecycle, /rejects other events/);
  assert.match(lifecycle, /sole reviewer-contract source/);
  assert.doesNotMatch(
    lifecycle,
    /deployment identifiers belong in repository variables/,
  );

  const guideActionReferences = [
    ...guide.matchAll(/uses:\s+(actions\/[^\s#]+)/g),
  ].map(([, reference]) => reference);
  for (const reference of guideActionReferences) {
    assert.match(reference, /^actions\/[^@\s]+@[a-f0-9]{40}$/);
  }
});
