import fs from "node:fs";
import path from "node:path";

export function assertSha(value, name) {
  if (!/^[a-f0-9]{40}$/i.test(value)) {
    throw new Error(`${name} is not a full Git commit SHA`);
  }
}

export function assertRelativePath(value, name = "path") {
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

export async function ensureInside(root, relative, { mustExist = true } = {}) {
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
