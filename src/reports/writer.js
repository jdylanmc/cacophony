import fs from "node:fs";
import path from "node:path";

async function atomicWrite(filePath, content) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 });
  await fs.promises.rename(temporary, filePath);
}

export async function writeReports(report, markdown, reportDirectory) {
  if (!path.isAbsolute(reportDirectory)) {
    throw new Error("Report directory must be an absolute path");
  }
  const jsonPath = path.join(reportDirectory, "report.json");
  const markdownPath = path.join(reportDirectory, "report.md");
  await atomicWrite(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await atomicWrite(markdownPath, markdown);
  return {
    jsonPath,
    markdownPath,
  };
}
