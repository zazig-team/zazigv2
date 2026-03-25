/**
 * deployer.ts — Test Environment Deployment
 *
 * Adapter-based deploy client for pushing feature branches to test environments.
 * Supports multiple deployment targets (Netlify, Supabase) via the DeployAdapter interface.
 *
 * Used by the local agent when the orchestrator sends a DeployToTest message
 * after feature verification passes.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
/** Shell exec function signature used by deploy adapters (was in verifier.ts). */
export type ExecFn = (
  cmd: string,
  args: string[],
  opts: { cwd: string; timeout: number },
) => Promise<{ stdout: string; stderr: string }>;

const defaultExec = promisify(execFile);

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface DeployResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface DeployAdapter {
  deploy(branch: string, projectId: string): Promise<DeployResult>;
}

// ---------------------------------------------------------------------------
// NetlifyAdapter
// ---------------------------------------------------------------------------

export class NetlifyAdapter implements DeployAdapter {
  private readonly exec: ExecFn;
  private readonly siteId: string | undefined;

  constructor(exec?: ExecFn, siteId?: string) {
    this.exec = exec ?? (defaultExec as unknown as ExecFn);
    this.siteId = siteId;
  }

  async deploy(branch: string, projectId: string): Promise<DeployResult> {
    const site = this.siteId ?? projectId;
    try {
      await this.exec(
        "netlify",
        ["deploy", `--branch=${branch}`, `--site=${site}`, "--prod"],
        { cwd: process.cwd(), timeout: 300_000 },
      );
      return { success: true, url: `https://${branch}--${site}.netlify.app` };
    } catch (err: unknown) {
      return { success: false, error: getStderr(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// SupabaseAdapter
// ---------------------------------------------------------------------------

export class SupabaseAdapter implements DeployAdapter {
  private readonly exec: ExecFn;

  constructor(exec?: ExecFn) {
    this.exec = exec ?? (defaultExec as unknown as ExecFn);
  }

  async deploy(_branch: string, projectId: string): Promise<DeployResult> {
    try {
      await this.exec(
        "supabase",
        ["functions", "deploy", `--project-ref=${projectId}`],
        { cwd: process.cwd(), timeout: 300_000 },
      );
      return { success: true, url: `https://${projectId}.supabase.co` };
    } catch (err: unknown) {
      return { success: false, error: getStderr(err) };
    }
  }
}

// ---------------------------------------------------------------------------
// TestEnvDeployer
// ---------------------------------------------------------------------------

export class TestEnvDeployer {
  constructor(private adapters: Map<string, DeployAdapter>) {}

  async deploy(branch: string, projectId: string, projectType: string): Promise<DeployResult> {
    const adapter = this.adapters.get(projectType);
    if (!adapter) return { success: false, error: `No deploy adapter for ${projectType}` };
    return adapter.deploy(branch, projectId);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getStderr(err: unknown): string {
  if (typeof err === "object" && err !== null && "stderr" in err) {
    return String(err.stderr ?? "");
  }
  return String(err);
}
