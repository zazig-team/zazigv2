# Standalone Binary Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace npm-linked .mjs distribution with Bun-compiled native binaries distributed via GitHub Releases, with auto-update on `zazig start`.

**Architecture:** `promote` compiles .mjs bundles into native macOS binaries via `bun build --compile`, uploads them to a GitHub Release via `gh`. On `zazig start`, the CLI queries the `agent_versions` table for the latest version, compares against the local `.version` file in `~/.zazigv2/bin/`, and if outdated downloads new binaries from the GitHub Release, replaces them, and exits asking the user to re-run.

**Tech Stack:** TypeScript, Bun (compile only, on promote machine), GitHub Releases (via `gh` CLI), Supabase (`agent_versions` table)

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `packages/cli/src/lib/auto-update.ts` | Create | Check remote version, download release assets, replace local binaries |
| `packages/cli/src/lib/builds.ts` | Modify | Update paths from `~/.zazigv2/builds/current/` to `~/.zazigv2/bin/`, update rollback |
| `packages/cli/src/commands/promote.ts` | Modify | Add Bun compile step, GitHub Release creation + asset upload |
| `packages/cli/src/commands/start.ts` | Modify | Add auto-update check before daemon spawn |
| `packages/cli/src/lib/daemon.ts` | Modify | Spawn compiled binary directly instead of via `node` |
| `packages/cli/scripts/compile.sh` | Create | Shell script to Bun-compile the 3 .mjs bundles |

---

## Chunk 1: Auto-Update Module + Builds Migration

### Task 1: Create `auto-update.ts` — version checking and download

**Files:**
- Create: `packages/cli/src/lib/auto-update.ts`
- Test: `packages/cli/src/lib/auto-update.test.ts`

The auto-update module is the core new functionality. It:
1. Reads the local version from `~/.zazigv2/bin/.version`
2. Queries `agent_versions` for the latest version for the current env
3. If outdated, downloads release assets from GitHub and replaces local binaries

**Important context:**
- The `agent_versions` table has columns: `id`, `env`, `version`, `commit_sha`, `created_at`
- It has an index on `(env, created_at DESC)` for efficient "latest" queries
- RLS allows anon SELECT — but we query via authenticated Supabase client from `start.ts`
- The GitHub repo is hardcoded as `zazig-team/zazigv2`
- Release assets are named: `zazig-cli-darwin-arm64`, `zazig-agent-darwin-arm64`, `agent-mcp-server-darwin-arm64`
- Binaries live at `~/.zazigv2/bin/zazig`, `~/.zazigv2/bin/zazig-agent`, `~/.zazigv2/bin/agent-mcp-server`
- Version file: `~/.zazigv2/bin/.version` (contains the semver, e.g. `0.13.0`)
- **IMPORTANT:** The existing `registerAgentVersion` call in `promote.ts` passes `agentBuildHash` (a git short hash) as the `version`. This plan changes it to pass `newVersion` (the semver) instead, so that the auto-update comparison works correctly. See Task 4.

- [ ] **Step 1: Write the test file with tests for getLocalVersion**

Create `packages/cli/src/lib/auto-update.test.ts`. This is the **complete** test file — all `vi.mock` calls and imports are consolidated here. Later steps add `describe` blocks to this file but do NOT add additional `vi.mock` calls.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  existsSync, readFileSync, mkdirSync, writeFileSync,
  chmodSync, renameSync, rmSync, cpSync,
} from "node:fs";
import {
  getLocalVersion, getRemoteVersion, downloadAndInstall, checkForUpdate,
} from "./auto-update.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    chmodSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    cpSync: vi.fn(),
  };
});

const existsSyncMock = vi.mocked(existsSync);
const readFileSyncMock = vi.mocked(readFileSync);
const writeFileSyncMock = vi.mocked(writeFileSync);
const chmodSyncMock = vi.mocked(chmodSync);

describe("getLocalVersion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when .version file does not exist", () => {
    existsSyncMock.mockReturnValue(false);
    expect(getLocalVersion()).toBeNull();
  });

  it("returns trimmed version string when file exists", () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.13.0\n");
    expect(getLocalVersion()).toBe("0.13.0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: FAIL — module `./auto-update.js` not found

- [ ] **Step 3: Write minimal `auto-update.ts` with `getLocalVersion`**

Create `packages/cli/src/lib/auto-update.ts`:

```typescript
/**
 * auto-update.ts — Check for newer zazig versions and download them.
 *
 * On `zazig start`, checks the agent_versions table for the latest version,
 * compares against ~/.zazigv2/bin/.version, and if outdated downloads new
 * binaries from the matching GitHub Release.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BIN_DIR = join(homedir(), ".zazigv2", "bin");
const VERSION_FILE = join(BIN_DIR, ".version");

export function getLocalVersion(): string | null {
  if (!existsSync(VERSION_FILE)) return null;
  return readFileSync(VERSION_FILE, "utf-8").trim() || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: PASS

- [ ] **Step 5: Add test for `getRemoteVersion`**

Append this `describe` block to the test file (do NOT add new imports — `getRemoteVersion` is already imported at the top from Step 1):

```typescript
describe("getRemoteVersion", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns latest version from agent_versions", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([
        { version: "0.14.0", commit_sha: "abc1234" },
      ]),
    });

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ version: "0.14.0", commitSha: "abc1234" });
  });

  it("returns null when no versions found", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toBeNull();
  });

  it("returns null on fetch error", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));

    const result = await getRemoteVersion("https://example.supabase.co", "anon-key", "production");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: FAIL — `getRemoteVersion` not exported

- [ ] **Step 7: Implement `getRemoteVersion`**

Add to `auto-update.ts`:

```typescript
export interface RemoteVersion {
  version: string;
  commitSha: string;
}

export async function getRemoteVersion(
  supabaseUrl: string,
  anonKey: string,
  env: string,
): Promise<RemoteVersion | null> {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/agent_versions?env=eq.${env}&order=created_at.desc&limit=1&select=version,commit_sha`,
      { headers: { apikey: anonKey } },
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ version: string; commit_sha: string }>;
    if (rows.length === 0) return null;
    return { version: rows[0]!.version, commitSha: rows[0]!.commit_sha };
  } catch {
    return null;
  }
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: PASS

- [ ] **Step 9: Add test for `downloadAndInstall`**

Append this `describe` block to the existing test file (do NOT add new `vi.mock` calls or imports — they are already at the top from Step 1):

```typescript
describe("downloadAndInstall", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("downloads 3 assets and writes them to bin dir", async () => {
    const fakeBuffer = new ArrayBuffer(8);
    fetchMock.mockResolvedValue({
      ok: true,
      arrayBuffer: vi.fn().mockResolvedValue(fakeBuffer),
    });
    existsSyncMock.mockReturnValue(false);

    await downloadAndInstall("0.14.0");

    // 3 downloads (cli, agent, mcp-server)
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // Each URL should be a GitHub release asset URL
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).toContain("github.com/zazig-team/zazigv2/releases/download/v0.14.0/");
    }
    // Should write .version file
    expect(writeFileSyncMock).toHaveBeenCalledWith(
      expect.stringContaining(".version"),
      "0.14.0",
    );
    // Should chmod each binary
    expect(chmodSyncMock).toHaveBeenCalledTimes(3);
  });

  it("throws on download failure", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" });
    existsSyncMock.mockReturnValue(false);

    await expect(downloadAndInstall("0.14.0")).rejects.toThrow(/download.*failed/i);
  });
});
```

- [ ] **Step 10: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: FAIL — `downloadAndInstall` not exported

- [ ] **Step 11: Implement `downloadAndInstall`**

Add to `auto-update.ts`:

```typescript
import { mkdirSync, writeFileSync, chmodSync, renameSync, rmSync, cpSync } from "node:fs";

const GITHUB_REPO = "zazig-team/zazigv2";
const PREVIOUS_DIR = join(BIN_DIR, "previous");

const ASSETS = [
  { remote: "zazig-cli-darwin-arm64", local: "zazig" },
  { remote: "zazig-agent-darwin-arm64", local: "zazig-agent" },
  { remote: "agent-mcp-server-darwin-arm64", local: "agent-mcp-server" },
] as const;

export async function downloadAndInstall(version: string): Promise<void> {
  mkdirSync(BIN_DIR, { recursive: true });

  // Backup current binaries
  if (existsSync(BIN_DIR) && existsSync(join(BIN_DIR, "zazig"))) {
    if (existsSync(PREVIOUS_DIR)) {
      rmSync(PREVIOUS_DIR, { recursive: true, force: true });
    }
    mkdirSync(PREVIOUS_DIR, { recursive: true });
    for (const { local } of ASSETS) {
      const src = join(BIN_DIR, local);
      if (existsSync(src)) {
        cpSync(src, join(PREVIOUS_DIR, local));
      }
    }
    const versionSrc = join(BIN_DIR, ".version");
    if (existsSync(versionSrc)) {
      cpSync(versionSrc, join(PREVIOUS_DIR, ".version"));
    }
  }

  // Download each asset
  const tag = `v${version}`;
  for (const { remote, local } of ASSETS) {
    const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${remote}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Download failed for ${remote}: ${res.status} ${res.statusText}`);
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const dest = join(BIN_DIR, local);
    writeFileSync(dest, buffer);
    chmodSync(dest, 0o755);
  }

  // Write version marker
  writeFileSync(VERSION_FILE, version);
}
```

Update the imports at the top to include the additional fs functions (remove the duplicate mock — the full mock list should be at the top of the test file, consolidating both sets of mocked functions).

- [ ] **Step 12: Run test to verify it passes**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: PASS

- [ ] **Step 13: Add test for `checkForUpdate` (the main orchestrator function)**

Append this `describe` block to the test file (do NOT add new imports — `checkForUpdate` is already imported at the top from Step 1):

```typescript
describe("checkForUpdate", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => vi.unstubAllGlobals());

  it("returns 'up-to-date' when versions match", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.13.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "up-to-date" });
  });

  it("returns 'update-available' when remote is newer", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.12.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "update-available", remoteVersion: "0.13.0" });
  });

  it("returns 'no-remote' when agent_versions is empty", async () => {
    existsSyncMock.mockReturnValue(true);
    readFileSyncMock.mockReturnValue("0.12.0\n");
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "no-remote" });
  });

  it("returns 'no-local' when no .version file exists (first install)", async () => {
    existsSyncMock.mockReturnValue(false);
    fetchMock.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([{ version: "0.13.0", commit_sha: "abc" }]),
    });

    const result = await checkForUpdate("https://example.supabase.co", "anon-key", "production");
    expect(result).toEqual({ status: "update-available", remoteVersion: "0.13.0" });
  });
});
```

- [ ] **Step 14: Run test to verify it fails**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: FAIL — `checkForUpdate` not exported

- [ ] **Step 15: Implement `checkForUpdate`**

Add to `auto-update.ts`:

```typescript
export type UpdateCheckResult =
  | { status: "up-to-date" }
  | { status: "update-available"; remoteVersion: string }
  | { status: "no-remote" };

export async function checkForUpdate(
  supabaseUrl: string,
  anonKey: string,
  env: string,
): Promise<UpdateCheckResult> {
  const remote = await getRemoteVersion(supabaseUrl, anonKey, env);
  if (!remote) return { status: "no-remote" };

  const local = getLocalVersion();
  if (local === remote.version) return { status: "up-to-date" };

  return { status: "update-available", remoteVersion: remote.version };
}
```

- [ ] **Step 16: Run all tests to verify they pass**

Run: `cd packages/cli && npx vitest run src/lib/auto-update.test.ts`
Expected: PASS (all tests)

- [ ] **Step 17: Commit**

```bash
git add packages/cli/src/lib/auto-update.ts packages/cli/src/lib/auto-update.test.ts
git commit -m "feat: add auto-update module for standalone binary distribution"
```

---

### Task 2: Update `builds.ts` — rollback for `~/.zazigv2/bin/`

**Files:**
- Modify: `packages/cli/src/lib/builds.ts`

The existing `builds.ts` manages `~/.zazigv2/builds/current/` and `previous/`. We need to update it so `rollback()` works with the new `~/.zazigv2/bin/` layout. We keep `pinCurrentBuild` for now (used by the existing promote flow during migration) but add a new `rollbackBinaries()` function.

- [ ] **Step 1: Add `rollbackBinaries` function to `builds.ts`**

Add to `packages/cli/src/lib/builds.ts`:

```typescript
const BIN_DIR = join(homedir(), ".zazigv2", "bin");
const BIN_PREVIOUS = join(BIN_DIR, "previous");

export function rollbackBinaries(): boolean {
  if (!existsSync(BIN_PREVIOUS)) {
    console.error("No previous binary version to rollback to.");
    return false;
  }

  const binaries = ["zazig", "zazig-agent", "agent-mcp-server", ".version"];
  for (const name of binaries) {
    const prev = join(BIN_PREVIOUS, name);
    const curr = join(BIN_DIR, name);
    if (existsSync(prev)) {
      cpSync(prev, curr);
    }
  }

  const version = existsSync(join(BIN_DIR, ".version"))
    ? readFileSync(join(BIN_DIR, ".version"), "utf-8").trim()
    : "unknown";
  console.log(`Rolled back binaries to: ${version}`);
  return true;
}
```

- [ ] **Step 2: Run existing tests to ensure nothing is broken**

Run: `cd packages/cli && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/builds.ts
git commit -m "feat: add rollbackBinaries for standalone binary distribution"
```

---

## Chunk 2: Promote Changes — Bun Compile + GitHub Release

### Task 3: Create `compile.sh` — Bun compile wrapper

**Files:**
- Create: `packages/cli/scripts/compile.sh`

This script takes the 3 `.mjs` bundles produced by `bundle.js` and compiles each into a standalone native binary using `bun build --compile`. It's called by `promote` after the bundle step.

**Important context:**
- Input files: `packages/cli/releases/zazig.mjs`, `packages/local-agent/releases/zazig-agent.mjs`, `packages/local-agent/releases/agent-mcp-server.mjs`
- Output files go to a temp directory passed as `$1` (e.g. `~/.zazigv2/compile-tmp/`)
- Output names: `zazig-cli-darwin-arm64`, `zazig-agent-darwin-arm64`, `agent-mcp-server-darwin-arm64`
- Bun must be installed on the promote machine (`brew install oven-sh/bun/bun`)
- The `.mjs` files use `#!/usr/bin/env node` shebangs and `createRequire` shims — Bun handles these natively

- [ ] **Step 1: Create the compile script**

Create `packages/cli/scripts/compile.sh`:

```bash
#!/usr/bin/env bash
#
# compile.sh — Compile .mjs bundles into standalone native binaries via Bun.
#
# Usage: ./compile.sh <output-dir> <repo-root>
#
# Requires: bun (brew install oven-sh/bun/bun)

set -euo pipefail

OUT_DIR="${1:?Usage: compile.sh <output-dir> <repo-root>}"
REPO_ROOT="${2:?Usage: compile.sh <output-dir> <repo-root>}"

if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install with: brew install oven-sh/bun/bun" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Compiling zazig CLI..."
bun build --compile "$REPO_ROOT/packages/cli/releases/zazig.mjs" \
  --outfile "$OUT_DIR/zazig-cli-darwin-arm64"

echo "Compiling zazig-agent..."
bun build --compile "$REPO_ROOT/packages/local-agent/releases/zazig-agent.mjs" \
  --outfile "$OUT_DIR/zazig-agent-darwin-arm64"

echo "Compiling agent-mcp-server..."
bun build --compile "$REPO_ROOT/packages/local-agent/releases/agent-mcp-server.mjs" \
  --outfile "$OUT_DIR/agent-mcp-server-darwin-arm64"

echo "Compiled 3 binaries to $OUT_DIR"
ls -lh "$OUT_DIR"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x packages/cli/scripts/compile.sh`

- [ ] **Step 3: Commit**

```bash
git add packages/cli/scripts/compile.sh
git commit -m "feat: add bun compile script for standalone binary builds"
```

---

### Task 4: Update `promote.ts` — add compile + GitHub Release steps

**Files:**
- Modify: `packages/cli/src/commands/promote.ts:386-498`

After the existing bundle step (step 5) and before the commit step (step 6), add:
- A Bun compile step that calls `compile.sh`
- After registering the version (step 8), create a GitHub Release and upload assets

**Important context:**
- `promote` runs in a temporary worktree at `~/.zazigv2/worktrees/promote-tmp`
- The `runPromote` function has the `repoRoot` variable pointing to the worktree
- `gh release create` requires the tag to exist — use `--target` to create from the commit
- `newVersion` variable holds the bumped semver (e.g. `0.14.0`)
- `commitSha` variable holds the full SHA of the promote commit
- The compiled binaries go to a temp dir, then get uploaded and cleaned up
- Also install binaries locally to `~/.zazigv2/bin/` instead of old pinned builds

- [ ] **Step 1: Add compile step after the existing bundle+hash-injection (after line 404)**

In `packages/cli/src/commands/promote.ts`, after the `injectAgentBuildHash` block and before the commit step, add:

```typescript
  // 5b. Compile native binaries from bundles
  console.log("\nCompiling native binaries...");
  const compileOutDir = join(homedir(), ".zazigv2", "compile-tmp");
  try {
    execSync(
      `bash "${join(repoRoot, "packages", "cli", "scripts", "compile.sh")}" "${compileOutDir}" "${repoRoot}"`,
      { stdio: "inherit" },
    );
  } catch {
    console.error("Bun compile failed. Is bun installed? (brew install oven-sh/bun/bun)");
    process.exitCode = 1;
    return;
  }
```

- [ ] **Step 2: Fix `registerAgentVersion` to pass semver instead of git hash**

In `runPromote`, find the existing call (around line 482):

```typescript
    await registerAgentVersion(creds, anonKey, "production", agentBuildHash, commitSha);
```

Change it to pass `newVersion` (the semver) instead of `agentBuildHash`:

```typescript
    await registerAgentVersion(creds, anonKey, "production", newVersion, commitSha);
```

Also update the log line below it:

```typescript
    console.log(`Registered production agent version ${newVersion} (${commitSha.slice(0, 7)}).`);
```

This is critical — the auto-update module compares the local `.version` file (semver) against `agent_versions.version`. If promote writes a git hash there, the versions will never match and every `zazig start` will re-download.

- [ ] **Step 3: Replace `pinCurrentBuild` and add local install + GitHub Release + cleanup**

Replace everything from the existing `pinCurrentBuild(repoRoot)` line through the end of `runPromote` with the following. The order is: install locally first (while temp dir exists), then create GitHub Release (also from temp dir), then cleanup temp dir.

```typescript
  // 9. Install binaries locally
  console.log("\nInstalling binaries locally...");
  const binDir = join(homedir(), ".zazigv2", "bin");
  mkdirSync(binDir, { recursive: true });
  const localBinaries = [
    { src: join(compileOutDir, "zazig-cli-darwin-arm64"), dest: join(binDir, "zazig") },
    { src: join(compileOutDir, "zazig-agent-darwin-arm64"), dest: join(binDir, "zazig-agent") },
    { src: join(compileOutDir, "agent-mcp-server-darwin-arm64"), dest: join(binDir, "agent-mcp-server") },
  ];
  for (const { src, dest } of localBinaries) {
    if (existsSync(src)) {
      cpSync(src, dest);
      chmodSync(dest, 0o755);
    }
  }
  writeFileSync(join(binDir, ".version"), newVersion);
  console.log(`Binaries installed to ${binDir}`);

  // 10. Create GitHub Release and upload binaries
  console.log("\nCreating GitHub Release...");
  const tag = `v${newVersion}`;
  try {
    execSync(
      `gh release create "${tag}" ` +
        `--repo zazig-team/zazigv2 ` +
        `--title "v${newVersion}" ` +
        `--notes "Production release ${newVersion} (${commitSha.slice(0, 7)})" ` +
        `--target "${commitSha}" ` +
        `"${join(compileOutDir, "zazig-cli-darwin-arm64")}" ` +
        `"${join(compileOutDir, "zazig-agent-darwin-arm64")}" ` +
        `"${join(compileOutDir, "agent-mcp-server-darwin-arm64")}"`,
      { stdio: "inherit" },
    );
    console.log(`GitHub Release ${tag} created with 3 binary assets.`);
  } catch (err) {
    console.error(`GitHub Release creation failed: ${String(err)}`);
    console.error("Binaries were not uploaded. You can retry with: gh release create ...");
    // Non-fatal — the version is registered, CI will deploy, only binary distribution failed
  }

  // 11. Cleanup compile temp dir
  try { rmSync(compileOutDir, { recursive: true, force: true }); } catch { /* */ }

  const sha = commitSha.slice(0, 7);
  console.log(`\nPromoted to production v${newVersion} (${sha}).`);
  console.log("CI will deploy Supabase migrations and edge functions.");
  console.log("Restart your production agent to use the new build: zazig stop && zazig start");
```

- [ ] **Step 4: Add necessary imports to `promote.ts`**

Add to the import block at the top of `promote.ts`:

```typescript
import { mkdirSync, chmodSync, cpSync } from "node:fs";
```

Note: `existsSync`, `readFileSync`, `rmSync`, `writeFileSync` are already imported. Check and only add what's missing.

- [ ] **Step 5: Update the `--rollback` handler to use `rollbackBinaries`**

Update the import and rollback handler:

```typescript
import { pinCurrentBuild, rollback as rollbackBuild, rollbackBinaries } from "../lib/builds.js";
```

Update the rollback block:

```typescript
  if (args.includes("--rollback")) {
    const ok = rollbackBinaries();
    process.exitCode = ok ? 0 : 1;
    return;
  }
```

- [ ] **Step 6: Run the build to verify the code compiles**

Run: `cd packages/cli && npm run build`
Expected: PASS (no type errors)

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/commands/promote.ts
git commit -m "feat: promote compiles native binaries and creates GitHub Release"
```

---

## Chunk 3: Start Auto-Update + Daemon Changes

### Task 5: Update `start.ts` — add auto-update check

**Files:**
- Modify: `packages/cli/src/commands/start.ts:86-191`

Add the auto-update check after authentication and before daemon spawn. If an update is available, download it and exit asking the user to re-run.

**Important context:**
- The `start()` function already has `creds` (Credentials) and `anonKey` available after line 133
- `zazigEnv` is resolved on line 180 — we need it before the update check
- The update check should only run for production env
- On update: print message and exit 0 (not error)
- On failure: warn but continue

- [ ] **Step 1: Add auto-update imports**

Add to the imports in `start.ts`:

```typescript
import { checkForUpdate, downloadAndInstall, getLocalVersion } from "../lib/auto-update.js";
```

- [ ] **Step 2: Add auto-update check after company selection (after line 144)**

Insert after the `console.log("Starting zazig for...")` line, before the "Stop existing daemon" block:

```typescript
  // Auto-update check (production only)
  const zazigEnv = process.env["ZAZIG_ENV"] ?? "production";
  if (zazigEnv === "production") {
    try {
      const updateResult = await checkForUpdate(creds.supabaseUrl, anonKey, "production");
      if (updateResult.status === "update-available") {
        console.log(`Update available: v${updateResult.remoteVersion}`);
        console.log("Downloading...");
        await downloadAndInstall(updateResult.remoteVersion);
        console.log(`\nUpdated zazig to v${updateResult.remoteVersion}. Please run 'zazig start' again.`);
        return;
      }
    } catch (err) {
      console.warn(`Auto-update check failed (continuing with current version): ${String(err)}`);
    }
  }
```

- [ ] **Step 3: Remove the duplicate `zazigEnv` declaration lower down**

The existing `const zazigEnv = process.env["ZAZIG_ENV"] ?? "production";` on line 180 will now conflict. Remove that line and use the one declared earlier in the function. If it's in a block scope that doesn't reach, move the declaration to the top of the function.

- [ ] **Step 4: Update the agent entry point resolution for production**

Replace the existing pinned build resolution block (lines 183-190):

```typescript
  let agentEntryOverride: string | undefined;

  if (zazigEnv === "production") {
    const binAgent = join(homedir(), ".zazigv2", "bin", "zazig-agent");
    if (existsSync(binAgent)) {
      agentEntryOverride = binAgent;
      const ver = getLocalVersion();
      console.log(`Using zazig-agent binary${ver ? ` (v${ver})` : ""}`);
    } else if (hasPinnedBuild()) {
      // Legacy fallback — old pinned .mjs build
      const buildDir = join(homedir(), ".zazigv2", "builds", "current");
      agentEntryOverride = join(buildDir, "packages", "local-agent", "releases", "zazig-agent.mjs");
      const sha = getCurrentBuildSha();
      console.log(`Using pinned build${sha ? ` (${sha.slice(0, 7)})` : ""}`);
    }
  } else if (zazigEnv === "staging") {
    console.log("Using repo build (staging mode)");
  }
```

Add `existsSync` to the imports from `node:fs` if not already imported. Check the file — `start.ts` doesn't currently import from `node:fs`, so add:

```typescript
import { existsSync } from "node:fs";
```

- [ ] **Step 5: Run the build to verify the code compiles**

Run: `cd packages/cli && npm run build`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/start.ts
git commit -m "feat: zazig start checks for updates and downloads new binaries"
```

---

### Task 6: Update `daemon.ts` — spawn compiled binary directly

**Files:**
- Modify: `packages/cli/src/lib/daemon.ts:144-169`

When the agent entry is a compiled binary (not a `.mjs` or `.js` file), spawn it directly instead of via `node`. The compiled Bun binary is self-contained and doesn't need Node.

**Important context:**
- Currently: `spawn(process.execPath, [agentEntry], ...)` — this runs `node <path>`
- For compiled binaries: `spawn(agentEntry, [], ...)` — the binary IS the executable
- We can detect this by checking if the path ends in `.mjs` or `.js`
- Only `startDaemonForCompany` needs updating (that's what `start.ts` calls)

- [ ] **Step 1: Update `startDaemonForCompany` to detect compiled binaries**

In `packages/cli/src/lib/daemon.ts`, replace the spawn logic in `startDaemonForCompany`:

```typescript
export function startDaemonForCompany(
  env: NodeJS.ProcessEnv,
  companyId: string,
  agentEntryOverride?: string,
): number {
  mkdirSync(LOG_DIR, { recursive: true });
  mkdirSync(ZAZIGV2_DIR, { recursive: true });

  const agentEntry = agentEntryOverride ?? resolveAgentEntry();
  const logPath = logPathForCompany(companyId);
  const logFd = openSync(logPath, "a");

  // Compiled binaries (no .mjs/.js extension) run directly.
  // Script entries need to be run via node.
  const isScript = agentEntry.endsWith(".mjs") || agentEntry.endsWith(".js");
  const command = isScript ? process.execPath : agentEntry;
  const args = isScript ? [agentEntry] : [];

  const child = spawn(command, args, {
    detached: true,
    stdio: ["ignore", logFd, logFd],
    env,
  });

  child.unref();

  const pid = child.pid;
  if (pid == null) throw new Error("Spawn succeeded but no PID was assigned");

  writeFileSync(pidPathForCompany(companyId), String(pid) + "\n");
  return pid;
}
```

- [ ] **Step 2: Run existing tests to verify nothing breaks**

Run: `cd packages/cli && npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/daemon.ts
git commit -m "feat: spawn compiled binaries directly instead of via node"
```

---

### Task 7: Manual Integration Test

No automated test — this is the manual smoke test to verify the full flow works end-to-end.

**Prerequisites:**
- Install Bun: `brew install oven-sh/bun/bun`
- Ensure `gh` CLI is authenticated and has access to `zazig-team/zazigv2`

- [ ] **Step 1: Build everything**

```bash
cd /path/to/zazigv2
npm run build
cd packages/cli
node scripts/bundle.js
```

- [ ] **Step 2: Test compile script standalone**

```bash
mkdir -p /tmp/zazig-compile-test
bash packages/cli/scripts/compile.sh /tmp/zazig-compile-test .
# Verify 3 binaries exist and are executable
ls -lh /tmp/zazig-compile-test/
/tmp/zazig-compile-test/zazig-cli-darwin-arm64 --version
```

- [ ] **Step 3: Run promote (creates release + installs locally)**

```bash
zazig-staging promote
# Verify it:
# - Compiles binaries
# - Creates GitHub Release
# - Installs to ~/.zazigv2/bin/
ls -lh ~/.zazigv2/bin/
cat ~/.zazigv2/bin/.version
```

- [ ] **Step 4: Test auto-update detection**

```bash
# Manually set local version to something old
echo "0.0.1" > ~/.zazigv2/bin/.version
# Run zazig start — should detect update and download
~/.zazigv2/bin/zazig start
# Expected: "Update available: v0.14.0" -> "Downloading..." -> "Please run 'zazig start' again."
```

- [ ] **Step 5: Add `~/.zazigv2/bin` to PATH**

```bash
echo 'export PATH="$HOME/.zazigv2/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
which zazig  # Should show ~/.zazigv2/bin/zazig
```

- [ ] **Step 6: Run zazig start from the new binary**

```bash
zazig start
# Should start normally (no update needed)
# Verify daemon is running
```

- [ ] **Step 7: Clean up old npm link (after confirming everything works)**

```bash
npm unlink -g @zazig/cli
```
