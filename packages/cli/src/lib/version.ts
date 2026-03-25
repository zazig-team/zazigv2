import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const thisDir = dirname(fileURLToPath(import.meta.url));

function isCompiledBinary(): boolean {
  // Bun compiled binaries have paths like /$bunfs/root/...
  return thisDir.startsWith("/$bunfs") || !existsSync(thisDir);
}

function findPackageJson(): string {
  for (const rel of ["../../package.json", "../package.json"]) {
    const candidate = join(thisDir, rel);
    if (existsSync(candidate)) return candidate;
  }
  return join(thisDir, "../../package.json");
}

export function getVersion(): string {
  // Compiled binary: read version from ~/.zazigv2/bin/.version
  if (isCompiledBinary()) {
    const versionFile = join(homedir(), ".zazigv2", "bin", ".version");
    try {
      return readFileSync(versionFile, "utf8").trim();
    } catch {
      return "0.0.0";
    }
  }

  // Running from source: read from package.json + git
  const pkgPath = findPackageJson();
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
