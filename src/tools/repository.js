import fs from "node:fs";

import {
  attestCheckout,
  createGitHandlers,
} from "./git-operations.js";
import { createConfinedFileHandlers } from "./confined-files.js";
import { createEvidenceStore } from "./evidence-store.js";
import {
  createToolRegistry,
  TOOL_DEFINITIONS,
} from "./tool-registry.js";

export { readActionPrompt, readPrompt } from "./prompt-loader.js";
export { TOOL_DEFINITIONS };

export async function createRepositoryTools({
  workspace,
  toolScope,
  evidenceFiles = [],
}) {
  const root = await fs.promises.realpath(workspace);
  const evidence = await createEvidenceStore(root, evidenceFiles);
  await attestCheckout(root, toolScope);

  return createToolRegistry({
    allowedNames: [...toolScope.allowedNames, ...evidence.toolNames],
    handlers: {
      ...createGitHandlers(root, toolScope.pullRequest),
      ...createConfinedFileHandlers(root),
      ...evidence.handlers,
    },
  });
}
