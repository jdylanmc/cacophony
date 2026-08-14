import fs from "node:fs";
import path from "node:path";

function isInside(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

export async function resolveReportDirectory(
  workspace,
  outputDirectory,
  agentId,
) {
  if (
    typeof agentId !== "string" ||
    !agentId ||
    agentId === "." ||
    agentId === ".." ||
    path.basename(agentId) !== agentId
  ) {
    throw new Error("Agent identifier must be one path segment");
  }
  const root = await fs.promises.realpath(workspace);
  const directory = path.resolve(root, outputDirectory, agentId);
  if (directory === root || !isInside(root, directory)) {
    throw new Error("Report output directory must be inside the workspace");
  }

  let existingAncestor = directory;
  while (true) {
    try {
      await fs.promises.lstat(existingAncestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
      const parent = path.dirname(existingAncestor);
      if (parent === existingAncestor) {
        throw new Error("Unable to resolve report output directory");
      }
      existingAncestor = parent;
    }
  }

  const realAncestor = await fs.promises.realpath(existingAncestor);
  if (!isInside(root, realAncestor)) {
    throw new Error("Report output directory resolves outside the workspace");
  }

  await fs.promises.mkdir(directory, { recursive: true });
  const realDirectory = await fs.promises.realpath(directory);
  if (realDirectory === root || !isInside(root, realDirectory)) {
    throw new Error("Report output directory resolves outside the workspace");
  }
  return realDirectory;
}
