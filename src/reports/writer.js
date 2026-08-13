import fs from "node:fs";
import path from "node:path";

async function atomicWrite(filePath, content) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
}

export async function writeReports(
  report,
  markdown,
  workspace,
  outputDirectory,
) {
  const root = await fs.promises.realpath(workspace);
  const directory = path.resolve(root, outputDirectory, report.agent.id);
  if (!directory.startsWith(`${root}${path.sep}`)) {
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
  if (realAncestor !== root && !realAncestor.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report output directory resolves outside the workspace");
  }

  await fs.promises.mkdir(directory, { recursive: true });
  const realDirectory = await fs.promises.realpath(directory);
  if (!realDirectory.startsWith(`${root}${path.sep}`)) {
    throw new Error("Report output directory resolves outside the workspace");
  }
  const jsonPath = path.join(realDirectory, "report.json");
  const markdownPath = path.join(realDirectory, "report.md");
  await atomicWrite(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(markdownPath, markdown);
  return {
    jsonPath,
    markdownPath,
    jsonRelative: path.relative(root, jsonPath),
    markdownRelative: path.relative(root, markdownPath),
  };
}
