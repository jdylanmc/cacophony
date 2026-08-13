#!/usr/bin/env node

import fs from "node:fs";

import { validateSubmission } from "../src/reports/model.js";
import { renderMarkdown } from "../src/reports/renderer.js";

const [command, inputPath, outputPath] = process.argv.slice(2);
if (!["validate", "render"].includes(command) || !inputPath) {
  process.stderr.write(
    "Usage: node scripts/report.js validate <submission.json>\n" +
      "   or: node scripts/report.js render <report.json> [report.md]\n",
  );
  process.exitCode = 2;
} else {
  try {
    const value = JSON.parse(await fs.promises.readFile(inputPath, "utf8"));
    if (command === "validate") {
      validateSubmission(value);
      process.stdout.write("Valid Cacophony report submission.\n");
    } else {
      const markdown = renderMarkdown(value);
      if (outputPath) {
        await fs.promises.writeFile(outputPath, markdown, "utf8");
      } else {
        process.stdout.write(markdown);
      }
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
