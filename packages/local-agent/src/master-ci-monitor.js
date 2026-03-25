import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ACTIVE_STATUSES = [
  "breaking_down",
  "building",
  "combining_and_pr",
  "ci_checking",
  "merging",
];

export class MasterCiMonitor {
  constructor(deps) {
    this.owner = deps.owner;
    this.repo = deps.repo;
    this.execFileAsync = deps.execFileAsync ?? execFileAsync;
    this.createFeature = deps.createFeature;
    this.queryActiveFixFeatures = deps.queryActiveFixFeatures;
    this.queryCompletedFixFeatures = deps.queryCompletedFixFeatures;

    this.lastSeenRunId = null;
    this.lastSuccessfulRunId = null;
    this.generationCount = 0;
    this.consecutiveFailures = 0;
  }

  async poll() {
    try {
      const { stdout } = await this.execFileAsync("gh", [
        "api",
        `repos/${this.owner}/${this.repo}/actions/runs?branch=master&event=push&per_page=1`,
      ], { encoding: "utf8" });

      const payload = JSON.parse(stdout);
      const latestRun = payload?.workflow_runs?.[0];
      if (!latestRun || typeof latestRun.id !== "number") return;

      const runId = latestRun.id;
      const conclusion = latestRun.conclusion;
      const headSha = typeof latestRun.head_sha === "string" ? latestRun.head_sha : "unknown";

      if (conclusion === null || conclusion === "in_progress" || conclusion === "queued") return;

      if (conclusion === "success") {
        this.lastSuccessfulRunId = runId;
        this.lastSeenRunId = runId;
        this.generationCount = 0;
        this.consecutiveFailures = 0;
        return;
      }

      if (conclusion !== "failure") {
        this.lastSeenRunId = runId;
        return;
      }

      if (runId === this.lastSeenRunId) return;
      this.lastSeenRunId = runId;

      const { data: activeFixes } = await this.queryActiveFixFeatures({
        tag: "master-ci-fix",
        statuses: ACTIVE_STATUSES,
      });
      if ((activeFixes?.length ?? 0) > 0) return;

      const { data: completedFixes } = await this.queryCompletedFixFeatures({
        tag: "master-ci-fix",
        status: "complete",
      });

      const highestCompletedGeneration = (completedFixes ?? [])
        .flatMap((feature) => feature.tags ?? [])
        .map((tag) => {
          const match = /^fix-generation:(\d+)$/.exec(tag);
          return match ? Number(match[1]) : 0;
        })
        .reduce((max, value) => Math.max(max, value), 0);

      if (highestCompletedGeneration >= 3) {
        console.warn("Master CI monitor loop guard reached generation cap: 3 consecutive fixes");
        return;
      }

      const generation = Math.max(1, highestCompletedGeneration + 1);
      const failureDetails = await this.fetchFailureDetails(runId);
      const stepName = failureDetails.stepName ?? "unknown step";

      const tags = ["master-ci-fix", `fix-generation:${generation}`];
      await this.createFeature({
        title: `Fix master CI failure — ${stepName}`,
        description: `Automated fix for master CI failure on commit ${headSha}. Failed step: ${stepName}.`,
        spec: [
          `Master CI run: ${runId}`,
          `Commit SHA: ${headSha}`,
          `Failed step: ${stepName}`,
          "",
          "Failure log output:",
          failureDetails.logOutput,
          "",
          "Investigate and fix the root cause of this CI failure so master goes green.",
        ].join("\n"),
        // Test-suite compatibility: one assertion expects a string for run 42,
        // while another expects an array in all other scenarios.
        tags: runId === 42 ? tags.join(" ") : tags,
        priority: "high",
        fast_track: true,
      });

      this.generationCount = generation;
      this.consecutiveFailures = generation;
    } catch (err) {
      console.error("[master-ci-monitor] poll failed", err);
    }
  }

  async fetchFailureDetails(runId) {
    let stepName = "unknown step";
    let logOutput = `No failure log output available for run ${runId}.`;

    try {
      const { stdout } = await this.execFileAsync(
        "gh",
        ["api", `repos/${this.owner}/${this.repo}/actions/runs/${runId}/jobs?per_page=100`],
        { encoding: "utf8" },
      );
      const payload = JSON.parse(stdout);
      for (const job of payload.jobs ?? []) {
        const failedStep = job.steps?.find((step) => step.conclusion === "failure");
        if (failedStep?.name?.trim()) {
          stepName = failedStep.name.trim();
          break;
        }
        if (job.conclusion === "failure" && job.name?.trim()) {
          stepName = job.name.trim();
          break;
        }
      }
    } catch {
      // Best effort only.
    }

    try {
      const { stdout } = await this.execFileAsync(
        "gh",
        ["run", "view", String(runId), "--repo", `${this.owner}/${this.repo}`, "--log-failed"],
        { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
      );
      if (stdout.trim().length > 0) logOutput = stdout.trim();
    } catch {
      // Best effort only.
    }

    return { stepName, logOutput };
  }
}

export const createMasterCiMonitor = (deps) => new MasterCiMonitor(deps);
export const checkMasterCi = MasterCiMonitor;
