import fs from "node:fs";
import path from "node:path";

import {
  MAX_EVIDENCE_FILE_BYTES,
  MAX_EVIDENCE_READ_BYTES,
  MAX_SEARCH_RESULTS,
  MAX_TOTAL_EVIDENCE_BYTES,
} from "./repository-limits.js";
import { assertRelativePath, ensureInside } from "./path-policy.js";

export async function createEvidenceStore(root, evidenceFiles) {
  const evidence = new Map();
  let totalEvidenceBytes = 0;
  for (const declaredPath of evidenceFiles) {
    const file = await ensureInside(root, declaredPath);
    const stat = await fs.promises.stat(file);
    if (!stat.isFile()) {
      throw new Error(`evidence file is not a file: ${declaredPath}`);
    }
    if (stat.size > MAX_EVIDENCE_FILE_BYTES) {
      throw new Error(
        `evidence file exceeds ${MAX_EVIDENCE_FILE_BYTES} bytes: ${declaredPath}`,
      );
    }
    totalEvidenceBytes += stat.size;
    if (totalEvidenceBytes > MAX_TOTAL_EVIDENCE_BYTES) {
      throw new Error(
        `declared evidence exceeds ${MAX_TOTAL_EVIDENCE_BYTES} total bytes`,
      );
    }
    evidence.set(path.relative(root, file), { file, bytes: stat.size });
  }

  return {
    toolNames:
      evidence.size > 0
        ? ["list_evidence", "read_evidence", "search_evidence"]
        : [],
    handlers: createEvidenceHandlers(evidence),
  };
}

function createEvidenceHandlers(evidence) {
  return {
    list_evidence() {
      return {
        files: [...evidence.entries()].map(([evidencePath, metadata]) => ({
          path: evidencePath,
          bytes: metadata.bytes,
        })),
      };
    },

    async read_evidence(args) {
      const metadata = evidence.get(assertRelativePath(args.path));
      if (!metadata) {
        throw new Error("path is not a declared evidence file");
      }
      const offset = args.offset ?? 0;
      const maximum = args.max_bytes ?? MAX_EVIDENCE_READ_BYTES;
      if (
        !Number.isInteger(offset) ||
        offset < 0 ||
        !Number.isInteger(maximum) ||
        maximum < 1 ||
        maximum > MAX_EVIDENCE_READ_BYTES
      ) {
        throw new Error("invalid evidence byte range");
      }
      const handle = await fs.promises.open(metadata.file, "r");
      try {
        const length = Math.min(maximum, Math.max(0, metadata.bytes - offset));
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        const content = buffer.subarray(0, bytesRead).toString("utf8");
        if (content.includes("\0")) {
          throw new Error("binary evidence files cannot be read");
        }
        return {
          path: args.path,
          offset,
          bytesRead,
          totalBytes: metadata.bytes,
          nextOffset:
            offset + bytesRead < metadata.bytes ? offset + bytesRead : null,
          content,
        };
      } finally {
        await handle.close();
      }
    },

    async search_evidence(args) {
      if (
        typeof args.query !== "string" ||
        !args.query ||
        args.query.length > 200
      ) {
        throw new Error("query must contain 1 through 200 characters");
      }
      const selected =
        args.path === undefined
          ? [...evidence.entries()]
          : [
              [
                assertRelativePath(args.path),
                evidence.get(assertRelativePath(args.path)),
              ],
            ];
      if (selected.some(([, metadata]) => !metadata)) {
        throw new Error("path is not a declared evidence file");
      }
      const matches = [];
      for (const [evidencePath, metadata] of selected) {
        const buffer = await fs.promises.readFile(metadata.file);
        if (buffer.includes(0)) {
          throw new Error(
            `binary evidence files cannot be searched: ${evidencePath}`,
          );
        }
        const query = Buffer.from(args.query, "utf8");
        let offset = 0;
        while (matches.length < MAX_SEARCH_RESULTS) {
          const match = buffer.indexOf(query, offset);
          if (match === -1) {
            break;
          }
          matches.push({
            path: evidencePath,
            offset: match,
            context: buffer
              .subarray(
                Math.max(0, match - 250),
                match + query.length + 250,
              )
              .toString("utf8"),
          });
          offset = match + query.length;
        }
        if (matches.length >= MAX_SEARCH_RESULTS) {
          return { matches, truncated: true };
        }
      }
      return { matches, truncated: false };
    },
  };
}
