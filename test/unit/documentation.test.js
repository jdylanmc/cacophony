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
    "jdylanmc/cacophony@7f31d99597e908372592dec996720749b476889c",
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

test("secret-backed trusted-base workflows authorize provider spend", async () => {
  const workflowFiles = await listWorkflowFiles([".github"]);

  for (const file of workflowFiles) {
    const workflow = await fs.promises.readFile(file, "utf8");
    if (
      !workflow.includes("pull_request_target:") ||
      !workflow.includes("secrets.CACOPHONY_AZURE_API_KEY")
    ) {
      continue;
    }

    assert.match(workflow, /name: Authorize Azure-backed review/);
    assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/);
    assert.match(workflow, /cancel-in-progress: true/);

    const authorization = workflow.indexOf(
      "name: Authorize Azure-backed review",
    );
    const checkout = workflow.indexOf("uses: actions/checkout@");
    const secret = workflow.indexOf("secrets.CACOPHONY_AZURE_API_KEY");
    assert.ok(authorization < checkout, `${file} must authorize before checkout`);
    assert.ok(authorization < secret, `${file} must authorize before secret use`);
  }
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
  assert.match(workflow, /path: \.cacophony\/out\//);
  assert.match(prompt, /correctness defects/);
});

test("Hello World dogfood runs a model-generated joke prompt", async () => {
  const prompt = await fs.promises.readFile(
    ".cacophony/agents/hello-world.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/hello-world.yml",
    "utf8",
  );
  assert.match(prompt, /exactly `Hello World`/);
  assert.match(prompt, /programmer joke generated for this run/);
  assert.doesNotMatch(prompt, /dark mode|light attracts bugs/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(
    workflow,
    /ref: refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/merge/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /prompt-file: \.cacophony\/agents\/hello-world\.md/);
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(workflow, /deployment: gpt-5\.4-mini/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /name: cacophony-hello-world/);
});

test("Gilfoyle sample matches the bootstrapped security reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/gilfoyle-security-architect.md",
    "utf8",
  );
  const samplePrompt = await fs.promises.readFile(
    "examples/reviewers/gilfoyle-security-architect.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/gilfoyle-security-architect.yml",
    "utf8",
  );

  assert.equal(samplePrompt, activePrompt);
  assert.match(activePrompt, /\[BLOCK: SECURITY\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(
    workflow,
    /prompt-file: \.cacophony\/agents\/gilfoyle-security-architect\.md/,
  );
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /name: Authorize Azure-backed review/);
  assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /name: cacophony-gilfoyle-security-architect/);
});

test("Solid Snake sample matches its independent architecture reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/solid-snake-architecture.md",
    "utf8",
  );
  const samplePrompt = await fs.promises.readFile(
    "examples/reviewers/solid-snake-architecture.md",
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

  assert.equal(samplePrompt, activePrompt);
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
  assert.match(workflow, /pull_request_target:/);
  assert.doesNotMatch(workflow, /head\.repo\.full_name == github\.repository/);
  assert.match(workflow, /name: Authorize Azure-backed review/);
  assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(
    workflow,
    /ref: refs\/pull\/\$\{\{ github\.event\.pull_request\.number \}\}\/merge/,
  );
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /loads prompt-file from pull_request\.base\.sha via git show/);
  assert.match(
    workflow,
    /prompt-file: \.cacophony\/agents\/solid-snake-architecture\.md/,
  );
  assert.match(workflow, /uses: jdylanmc\/cacophony@[a-f0-9]{40}/);
  assert.match(workflow, /deployment: gpt-5\.6-sol/);
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /timeout-seconds: 600/);
  assert.match(workflow, /name: cacophony-solid-snake-architecture/);
  assert.match(
    workflow,
    /git cat-file -e "\$BASE_SHA:\.cacophony\/agents\/solid-snake-architecture\.md"/,
  );
  assert.match(workflow, /if: steps\.prompt\.outputs\.ready == 'true'/);
  assert.notEqual(workflow, gilfoyleWorkflow);
});

test("GLaDOS sample matches its independent documentation reviewer", async () => {
  const activePrompt = await fs.promises.readFile(
    ".cacophony/agents/glados-documentation-sentinel.md",
    "utf8",
  );
  const samplePrompt = await fs.promises.readFile(
    "examples/reviewers/glados-documentation-sentinel.md",
    "utf8",
  );
  const workflow = await fs.promises.readFile(
    ".github/workflows/glados-documentation-sentinel.yml",
    "utf8",
  );

  assert.equal(samplePrompt, activePrompt);
  assert.match(activePrompt, /\[BLOCK: TESTING_ANOMALY\]/);
  assert.match(activePrompt, /\[APPROVED\]/);
  assert.match(activePrompt, /Documentation symmetry and deep impact/);
  assert.match(activePrompt, /Self-documenting clarity/);
  assert.match(activePrompt, /Stale and mismatched comments/);
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /name: Authorize Azure-backed review/);
  assert.match(workflow, /OWNER\|MEMBER\|COLLABORATOR/);
  assert.match(workflow, /cancel-in-progress: true/);
  assert.match(
    workflow,
    /deployment: gpt-5\.4-mini/,
  );
  assert.match(
    workflow,
    /prompt-file: \.cacophony\/agents\/glados-documentation-sentinel\.md/,
  );
  assert.match(workflow, /max-turns: 20/);
  assert.match(workflow, /rate-limit-retries: 2/);
  assert.match(workflow, /name: cacophony-glados-documentation-sentinel/);
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
    assert.match(content, /examples\/reviewers\/<slug>\.md/);
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
  assert.match(lifecycle, /distinct non-review outcome/);
  assert.match(lifecycle, /consumer repository configuration contract/);
  assert.match(lifecycle, /canonical simple consumer workflow/);
  assert.match(lifecycle, /unauthorized fork authors/);
  assert.match(lifecycle, /workflow this skill creates/);
  assert.doesNotMatch(
    lifecycle,
    /deployment identifiers belong in repository variables/,
  );

  const guideActionReferences = [
    ...guide.matchAll(/uses:\s+(actions\/[^\s#]+)/g),
  ].map(([, reference]) => reference);
  assert.notEqual(guideActionReferences.length, 0);
  for (const reference of guideActionReferences) {
    assert.match(reference, /^actions\/[^@\s]+@[a-f0-9]{40}$/);
  }
});
