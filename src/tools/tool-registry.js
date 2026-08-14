import { MAX_EVIDENCE_READ_BYTES } from "./repository-limits.js";

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
    name: "list_evidence",
    description: "List declared structured evidence files and their sizes.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "read_evidence",
    description:
      "Read a byte range from one declared evidence file. Use offset to continue through large reports.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string" },
        offset: { type: "integer", minimum: 0 },
        max_bytes: {
          type: "integer",
          minimum: 1,
          maximum: MAX_EVIDENCE_READ_BYTES,
        },
      },
      required: ["path"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "search_evidence",
    description:
      "Search declared evidence files for a case-sensitive literal and return bounded surrounding context.",
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

export function createToolRegistry({ allowedNames, handlers }) {
  const authorized = new Set(allowedNames);
  return {
    definitions: TOOL_DEFINITIONS.filter((tool) => authorized.has(tool.name)),
    async execute(name, args = {}) {
      if (!authorized.has(name)) {
        throw new Error(`Tool is unavailable for this review target: ${name}`);
      }
      const handler = handlers[name];
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return handler(args);
    },
  };
}
