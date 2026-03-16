/**
 * auto-update.ts — Check for newer zazig versions and download them.
 *
 * On `zazig start`, checks the agent_versions table for the latest version,
 * compares against ~/.zazigv2/bin/.version, and if outdated downloads new
 * binaries from the matching GitHub Release.
 */

import {
  existsSync, readFileSync, mkdirSync, writeFileSync,
  chmodSync, rmSync, cpSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const BIN_DIR = join(homedir(), ".zazigv2", "bin");
const VERSION_FILE = join(BIN_DIR, ".version");
const GITHUB_REPO = "zazig-team/zazigv2";
const PREVIOUS_DIR = join(BIN_DIR, "previous");

const ASSETS = [
  { remote: "zazig-cli-darwin-arm64", local: "zazig" },
  { remote: "zazig-agent-darwin-arm64", local: "zazig-agent" },
  { remote: "agent-mcp-server-darwin-arm64", local: "agent-mcp-server" },
] as const;

export function getLocalVersion(): string | null {
  if (!existsSync(VERSION_FILE)) return null;
  return readFileSync(VERSION_FILE, "utf-8").trim() || null;
}

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

export async function downloadAndInstall(version: string): Promise<void> {
  mkdirSync(BIN_DIR, { recursive: true });

  // Backup current binaries
  if (existsSync(join(BIN_DIR, "zazig"))) {
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
    if (existsSync(VERSION_FILE)) {
      cpSync(VERSION_FILE, join(PREVIOUS_DIR, ".version"));
    }
  }

  // Download each asset
  const tag = `v${version}`;
  const githubToken = process.env["GITHUB_TOKEN"];
  const authHeaders: Record<string, string> = githubToken
    ? { Authorization: `Bearer ${githubToken}` }
    : {};
  for (const { remote, local } of ASSETS) {
    const url = `https://github.com/${GITHUB_REPO}/releases/download/${tag}/${remote}`;
    const res = await fetch(url, { headers: authHeaders });
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
