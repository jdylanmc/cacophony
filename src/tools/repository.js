import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 200_000;
const MAX_DIFF_BYTES = 500_000;
const MAX_SEARCH_BYTES = 5_000_000;
const MAX_LIST_ENTRIES = 1_000;
const MAX_SEARCH_RESULTS = 100;

function assertSha(value, name) {
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error(`${name} is not a full Git commit SHA`);
  }
}

function assertRelativePath(value, name = "path") {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) {
    throw new Error(`${name} must be a non-empty repository-relative path`);
  }
  const normalized = path.normalize(value);
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) {
    throw new Error(`${name} cannot leave the repository`);
  }
  if (normalized === ".git" || normalized.startsWith(`.git${path.sep}`)) {
    throw new Error(`${name} cannot access .git`);
  }
  return normalized;
}

function truncate(value, maximum) {
  if (Buffer.byteLength(value, "utf8") <= maximum) {
    return { content: value, truncated: false };
  }
  return {
    content: `${Buffer.from(value).subarray(0, maximum).toString("utf8")}\n[truncated]`,
    truncated: true,
  };
}

async function ensureInside(root, relative, { mustExist = true } = {}) {
  const normalized = assertRelativePath(relative);
  const candidate = path.resolve(root, normalized);
  const prefix = `${root}${path.sep}`;
  if (candidate !== root && !candidate.startsWith(prefix)) {
    throw new Error("path cannot leave the repository");
  }

  if (!mustExist) {
    return candidate;
  }

  const real = await fs.promises.realpath(candidate);
  if (real !== root && !real.startsWith(prefix)) {
    throw new Error("path resolves outside the repository");
  }
  return real;
}

async function git(workspace, args, maximum = MAX_DIFF_BYTES) {
  try {
    const { stdout } = await execFileAsync("git", ["-C", workspace, ...args], {
      encoding: "utf8",
      maxBuffer: maximum + 1_000_000,
      timeout: 30_000,
      windowsHide: true,
    });
    return truncate(stdout, maximum);
  } catch (error) {
    const detail = String(error.stderr || error.message).trim();
    throw new Error(`git ${args[0]} failed: ${detail}`);
  }
}

async function walk(directory, root, results, state) {
  if (results.length >= state.maximumEntries) {
    return;
  }
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (results.length >= state.maximumEntries) {
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
      await walk(absolute, root, results, state);
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

export const TOOL_DEFINITIONS = [
  {
    type: "function",
    name: "get_pull_request",
    description: "Get trusted metadata for the pull request under review.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "list_changed_files",
    description: "List files changed between the pull request base and head commits.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "get_diff",
    description: "Read the pull request diff, optionally limited to one changed file.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "read_file",
    description: "Read a repository text file with optional inclusive line bounds.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        start_line: { type: "integer", minimum: 1 },
        end_line: { type: "integer", minimum: 1 },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "list_files",
    description: "List repository files under an optional directory.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_text",
    description: "Search repository text files for a case-sensitive literal string.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string" },
        path: { type: "string" },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "submit_report",
    description: "Submit the final structured review. This is the only way to finish.",
    parameters: {
      type: "object",
      properties: {
        verdict: { type: "string", enum: ["pass", "warn", "fail"] },
        summary: { type: "string" },
        limitations: { type: "string" },
        findings: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              severity: {
                type: "string",
                enum: ["low", "medium", "high", "critical"],
              },
              title: { type: "string" },
              explanation: { type: "string" },
              recommendation: { type: "string" },
              evidence: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    path: { type: "string" },
                    line: { type: "integer", minimum: 1 },
                    detail: { type: "string" },
                  },
                  required: ["path", "detail"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "severity",
              "title",
              "explanation",
              "recommendation",
              "evidence",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["verdict", "summary", "findings"],
      additionalProperties: false,
    },
  },
];

export async function createRepositoryTools({ workspace, context }) {
  const root = await fs.promises.realpath(workspace);
  const { baseSha, headSha } = context.pullRequest;
  assertSha(baseSha, "pull_request.base.sha");
  assertSha(headSha, "pull_request.head.sha");

  return {
    definitions: TOOL_DEFINITIONS,

    async execute(name, args = {}) {
      switch (name) {
        case "get_pull_request":
          return context.pullRequest;

        case "list_changed_files": {
          const result = await git(root, [
            "diff",
            "--name-status",
            "--find-renames",
            `${baseSha}...${headSha}`,
            "--",
          ]);
          return result;
        }

        case "get_diff": {
          const command = [
            "diff",
            "--no-ext-diff",
            "--find-renames",
            "--unified=3",
            `${baseSha}...${headSha}`,
            "--",
          ];
          if (args.path !== undefined) {
            command.push(assertRelativePath(args.path));
          }
          return git(root, command);
        }

        case "read_file": {
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
          if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
            throw new Error("invalid line range");
          }
          return {
            path: path.relative(root, file),
            startLine: start,
            endLine: Math.min(end, lines.length),
            content: lines.slice(start - 1, end).join("\n"),
          };
        }

        case "list_files": {
          const directory = args.path
            ? await ensureInside(root, args.path)
            : root;
          const stat = await fs.promises.stat(directory);
          if (!stat.isDirectory()) {
            throw new Error("path is not a directory");
          }
          const results = [];
          await walk(directory, root, results, { maximumEntries: MAX_LIST_ENTRIES });
          return {
            entries: results,
            truncated: results.length >= MAX_LIST_ENTRIES,
          };
        }

        case "search_text": {
          if (typeof args.query !== "string" || !args.query || args.query.length > 200) {
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
            if (fileStat.size > MAX_FILE_BYTES || bytesRead + fileStat.size > MAX_SEARCH_BYTES) {
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
        }

        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    },
  };
}

export async function readPrompt(workspace, promptFile, baseSha) {
  const root = await fs.promises.realpath(workspace);
  assertSha(baseSha, "pull_request.base.sha");
  const normalized = assertRelativePath(promptFile).split(path.sep).join("/");
  const result = await git(root, ["show", `${baseSha}:${normalized}`], MAX_FILE_BYTES);
  if (result.truncated) {
    throw new Error(`Prompt must be no larger than ${MAX_FILE_BYTES} bytes`);
  }
  return result.content;
}
