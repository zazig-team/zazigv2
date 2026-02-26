import { existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolve the zazig monorepo root from the compiled CLI location.
 *
 * From dist/lib/repo-root.js the repo root is four levels up:
 *   dist/lib/ -> dist/ -> packages/cli/ -> packages/ -> {repo}
 */
export function resolveRepoRoot(): string {
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(thisDir, "..", "..", "..", "..");
  if (!existsSync(join(candidate, "projects", "skills"))) {
    throw new Error(
      `Cannot resolve repo root — expected projects/skills/ at ${candidate}`
    );
  }
  return candidate;
}
