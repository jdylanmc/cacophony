import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const canonicalAgents = Object.freeze([
  Object.freeze({
    name: "Gilfoyle security audit",
    agent: "gilfoyle-security-architect",
    deployment: "gpt-5.6-sol",
  }),
  Object.freeze({
    name: "Solid Snake architecture audit",
    agent: "solid-snake-architecture",
    deployment: "gpt-5.6-sol",
  }),
  Object.freeze({
    name: "GLaDOS documentation audit",
    agent: "glados-documentation-sentinel",
    deployment: "gpt-5.4-mini",
  }),
  Object.freeze({
    name: "Master Chief domain audit",
    agent: "master-chief-domain-commander",
    deployment: "gpt-5.6-sol",
  }),
  Object.freeze({
    name: "Fletcher prompt audit",
    agent: "fletcher-prompt-conductor",
    deployment: "gpt-5.6-sol",
  }),
  Object.freeze({
    name: "Delamain documentation custody audit",
    agent: "delamain-documentation-custodian",
    deployment: "gpt-5.4-mini",
  }),
]);

export function selectRepositoryAuditAgents(agentFilter = "") {
  if (typeof agentFilter !== "string") {
    throw new Error("agent-filter must be a string");
  }

  const selected =
    agentFilter === ""
      ? canonicalAgents
      : canonicalAgents.filter(({ agent }) => agent === agentFilter);
  if (selected.length !== (agentFilter === "" ? canonicalAgents.length : 1)) {
    throw new Error(
      "Unknown agent-filter. Use a canonical agent slug or leave it empty.",
    );
  }
  return selected.map((agent) => ({ ...agent }));
}

function runCli() {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is required");
  }
  const matrix = {
    include: selectRepositoryAuditAgents(process.env.AGENT_FILTER ?? ""),
  };
  fs.appendFileSync(outputPath, `matrix=${JSON.stringify(matrix)}\n`, "utf8");
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : "";
if (import.meta.url === invokedPath) {
  try {
    runCli();
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
