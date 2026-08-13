import fs from "node:fs";

function command(name, message) {
  const escaped = String(message)
    .replaceAll("%", "%25")
    .replaceAll("\r", "%0D")
    .replaceAll("\n", "%0A");
  process.stdout.write(`::${name}::${escaped}\n`);
}

export function info(message) {
  process.stdout.write(`${message}\n`);
}

export function warning(message) {
  command("warning", message);
}

export function error(message) {
  command("error", message);
}

export async function setOutputs(outputs, outputFile = process.env.GITHUB_OUTPUT) {
  if (!outputFile) {
    for (const [name, value] of Object.entries(outputs)) {
      info(`${name}=${value}`);
    }
    return;
  }

  const entries = [];
  for (const [name, value] of Object.entries(outputs)) {
    const delimiter = `cacophony_${name}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    entries.push(`${name}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
  await fs.promises.appendFile(outputFile, entries.join(""), "utf8");
}
