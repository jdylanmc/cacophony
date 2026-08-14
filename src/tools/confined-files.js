import fs from "node:fs";
import path from "node:path";

import {
  MAX_FILE_BYTES,
  MAX_LIST_ENTRIES,
  MAX_SEARCH_BYTES,
  MAX_SEARCH_RESULTS,
} from "./repository-limits.js";
import { ensureInside } from "./path-policy.js";

async function walk(directory, root, results, maximumEntries) {
  if (results.length >= maximumEntries) {
    return;
  }
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (results.length >= maximumEntries) {
      return;
    }
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(root, absolute);
    if (entry.isSymbolicLink()) {
      results.push(`${relative}@`);
    } else if (entry.isDirectory()) {
      results.push(`${relative}/`);
      await walk(absolute, root, results, maximumEntries);
    } else if (entry.isFile()) {
      results.push(relative);
    }
  }
}

async function listFilePaths(directory, root, results) {
  if (results.length >= MAX_LIST_ENTRIES) {
    return;
  }
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules") {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await listFilePaths(absolute, root, results);
    } else if (entry.isFile()) {
      results.push(path.relative(root, absolute));
    }
    if (results.length >= MAX_LIST_ENTRIES) {
      return;
    }
  }
}

export function createConfinedFileHandlers(root) {
  return {
    async read_file(args) {
      const file = await ensureInside(root, args.path);
      const stat = await fs.promises.stat(file);
      if (!stat.isFile()) {
        throw new Error("path is not a file");
      }
      if (stat.size > MAX_FILE_BYTES) {
        throw new Error(`file exceeds ${MAX_FILE_BYTES} bytes`);
      }
      const content = await fs.promises.readFile(file, "utf8");
      if (content.includes("\0")) {
        throw new Error("binary files cannot be read");
      }
      const lines = content.split(/\r?\n/);
      const start = args.start_line ?? 1;
      const end = args.end_line ?? lines.length;
      if (
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 1 ||
        end < start
      ) {
        throw new Error("invalid line range");
      }
      return {
        path: path.relative(root, file),
        startLine: start,
        endLine: Math.min(end, lines.length),
        content: lines.slice(start - 1, end).join("\n"),
      };
    },

    async list_files(args) {
      const directory = args.path
        ? await ensureInside(root, args.path)
        : root;
      const stat = await fs.promises.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error("path is not a directory");
      }
      const results = [];
      await walk(directory, root, results, MAX_LIST_ENTRIES);
      return {
        entries: results,
        truncated: results.length >= MAX_LIST_ENTRIES,
      };
    },

    async search_text(args) {
      if (
        typeof args.query !== "string" ||
        !args.query ||
        args.query.length > 200
      ) {
        throw new Error("query must contain 1 through 200 characters");
      }
      const directory = args.path
        ? await ensureInside(root, args.path)
        : root;
      const stat = await fs.promises.stat(directory);
      if (!stat.isDirectory()) {
        throw new Error("path is not a directory");
      }

      const files = [];
      await listFilePaths(directory, root, files);
      const matches = [];
      let bytesRead = 0;
      for (const relative of files) {
        const absolute = path.join(root, relative);
        const fileStat = await fs.promises.stat(absolute);
        if (
          fileStat.size > MAX_FILE_BYTES ||
          bytesRead + fileStat.size > MAX_SEARCH_BYTES
        ) {
          continue;
        }
        bytesRead += fileStat.size;
        const content = await fs.promises.readFile(absolute, "utf8");
        if (content.includes("\0")) {
          continue;
        }
        const lines = content.split(/\r?\n/);
        for (let index = 0; index < lines.length; index += 1) {
          if (lines[index].includes(args.query)) {
            matches.push({
              path: relative,
              line: index + 1,
              text: lines[index].slice(0, 1_000),
            });
            if (matches.length >= MAX_SEARCH_RESULTS) {
              return { matches, truncated: true, bytesRead };
            }
          }
        }
      }
      return { matches, truncated: false, bytesRead };
    },
  };
}
