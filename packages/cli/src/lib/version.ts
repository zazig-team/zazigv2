import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const thisDir = dirname(fileURLToPath(import.meta.url));

function findPackageJson(): string {
  for (const rel of ["../../package.json", "../package.json"]) {
    const candidate = join(thisDir, rel);
    if (existsSync(candidate)) return candidate;
  }
  return join(thisDir, "../../package.json");
}

const pkgPath = findPackageJson();

export function getVersion(): string {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const base = pkg.version ?? "0.0.0";

  let hash = "";
  try {
    hash = execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return base;
  }

  let dirty = false;
  try {
    execSync("git diff --quiet HEAD", { stdio: ["pipe", "pipe", "pipe"] });
  } catch {
    dirty = true;
  }

  return `${base}+${hash}${dirty ? "-dirty" : ""}`;
}
