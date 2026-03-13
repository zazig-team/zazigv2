import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fetchJobDetail, fetchJobLogs, type JobDetail } from "../lib/queries";

interface JobDetailExpandProps {
  jobId: string;
}

type LogTab = "lifecycle" | "tmux";
type JobLogs = Record<LogTab, string>;

const ACTIVE_STATUSES = new Set(["executing", "running", "in_progress"]);
const COMPLETED_OR_FAILED_STATUSES = new Set(["complete", "completed", "failed"]);

function isActiveStatus(status: string): boolean {
  return ACTIVE_STATUSES.has(status.toLowerCase());
}

function isCompletedOrFailed(status: string): boolean {
  return COMPLETED_OR_FAILED_STATUSES.has(status.toLowerCase());
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "completed" || s === "shipped") return "detail-badge detail-badge--positive";
  if (s === "failed" || s === "cancelled") return "detail-badge detail-badge--negative";
  if (s === "executing" || s === "running" || s === "in_progress" || s === "dispatched") return "detail-badge detail-badge--active";
  if (s === "queued" || s === "proposal" || s === "ready") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

function formatElapsed(startedAt: string | null, completedAt: string | null, status: string): string {
  if (!startedAt) return "—";

  const startTime = Date.parse(startedAt);
  if (Number.isNaN(startTime)) return "—";

  const active = isActiveStatus(status);
  const endTime = active ? Date.now() : (completedAt ? Date.parse(completedAt) : Number.NaN);
  if (Number.isNaN(endTime)) return "—";

  const elapsedSeconds = Math.max(0, Math.floor((endTime - startTime) / 1000));
  if (elapsedSeconds >= 3600) {
    const hours = Math.floor(elapsedSeconds / 3600);
    const minutes = Math.floor((elapsedSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function clampProgress(progress: number | null): number {
  if (typeof progress !== "number" || Number.isNaN(progress)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(progress)));
}

function resolvedProgress(status: string, progress: number | null | undefined): number {
  const hasNumericProgress = typeof progress === "number" && !Number.isNaN(progress);
  if (isCompletedOrFailed(status) && !hasNumericProgress) {
    return 100;
  }

  return clampProgress(hasNumericProgress ? progress : null);
}

function trimToLast100Lines(text: string): string {
  return text.split(/\r?\n/).slice(-100).join("\n");
}

export default function JobDetailExpand({ jobId }: JobDetailExpandProps): JSX.Element {
  const [job, setJob] = useState<JobDetail | null>(null);
  const [logs, setLogs] = useState<JobLogs>({ lifecycle: "", tmux: "" });
  const [activeTab, setActiveTab] = useState<LogTab>("lifecycle");
  const [showFullResult, setShowFullResult] = useState(false);
  const [loadingJob, setLoadingJob] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [jobError, setJobError] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  const detailIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<LogTab>("lifecycle");
  const autoScrollRef = useRef(false);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useLayoutEffect(() => {
    if (!autoScrollRef.current) {
      return;
    }

    const node = logContainerRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
    autoScrollRef.current = false;
  }, [logs, activeTab]);

  useEffect(() => {
    let cancelled = false;

    function clearPolling(): void {
      if (detailIntervalRef.current !== null) {
        clearInterval(detailIntervalRef.current);
        detailIntervalRef.current = null;
      }

      if (logIntervalRef.current !== null) {
        clearInterval(logIntervalRef.current);
        logIntervalRef.current = null;
      }
    }

    async function refreshLogs(): Promise<void> {
      const logNode = logContainerRef.current;
      const shouldAutoScroll = logNode != null
        && logNode.scrollTop + logNode.clientHeight >= logNode.scrollHeight - 20;

      try {
        const [lifecycle, tmux] = await Promise.all([
          fetchJobLogs(jobId, "lifecycle"),
          fetchJobLogs(jobId, "tmux"),
        ]);

        if (cancelled) return;

        const nextLogs: JobLogs = {
          lifecycle: trimToLast100Lines(lifecycle.content),
          tmux: trimToLast100Lines(tmux.content),
        };

        setLogs((prev) => {
          const tab = activeTabRef.current;
          if (shouldAutoScroll && prev[tab] !== nextLogs[tab]) {
            autoScrollRef.current = true;
          }
          return nextLogs;
        });
        setLogError(null);
      } catch (error) {
        if (cancelled) return;
        setLogError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoadingLogs(false);
        }
      }
    }

    async function refreshJob(): Promise<void> {
      try {
        const nextJob = await fetchJobDetail(jobId);
        if (cancelled) return;

        setJob(nextJob);
        setJobError(null);

        if (isActiveStatus(nextJob.status)) {
          if (detailIntervalRef.current === null) {
            detailIntervalRef.current = setInterval(() => {
              void refreshJob();
            }, 10000);
          }
          if (logIntervalRef.current === null) {
            logIntervalRef.current = setInterval(() => {
              void refreshLogs();
            }, 5000);
          }
        } else {
          clearPolling();
        }
      } catch (error) {
        if (cancelled) return;
        setJobError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) {
          setLoadingJob(false);
        }
      }
    }

    clearPolling();
    setJob(null);
    setLogs({ lifecycle: "", tmux: "" });
    setLoadingJob(true);
    setLoadingLogs(true);
    setJobError(null);
    setLogError(null);
    setShowFullResult(false);
    setActiveTab("lifecycle");
    activeTabRef.current = "lifecycle";

    void Promise.all([refreshJob(), refreshLogs()]);

    return () => {
      cancelled = true;
      clearPolling();
    };
  }, [jobId]);

  const isActive = job ? isActiveStatus(job.status) : false;
  const isCompletedOrFailedJob = job ? isCompletedOrFailed(job.status) : false;
  const showProgress = Boolean(job) && (isActive || isCompletedOrFailedJob);
  const progress = job ? resolvedProgress(job.status, job.progress) : 0;

  const resultText = (job?.result ?? "").trim();
  const hasResultSummary = Boolean(job) && isCompletedOrFailedJob;
  const resultPreview = useMemo(() => {
    if (resultText.length <= 200) {
      return resultText || "—";
    }
    return `${resultText.slice(0, 200)}...`;
  }, [resultText]);

  return (
    <div className="job-expand">
      {loadingJob && !job ? (
        <div className="detail-loading">Loading job detail...</div>
      ) : jobError ? (
        <div className="detail-error">{jobError}</div>
      ) : job ? (
        <>
          <table className="detail-meta-table job-expand-meta">
            <tbody>
              <tr>
                <td className="detail-meta-key">Machine</td>
                <td className="detail-meta-val">{job.machine_name ?? "—"}</td>
              </tr>
              <tr>
                <td className="detail-meta-key">Slot</td>
                <td className="detail-meta-val">{job.slot_type ?? "—"}</td>
              </tr>
              <tr>
                <td className="detail-meta-key">Model</td>
                <td className="detail-meta-val">{job.model ?? "—"}</td>
              </tr>
              {showProgress ? (
                <tr>
                  <td className="detail-meta-key">Progress</td>
                  <td className="detail-meta-val">
                    <div className="job-expand-progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
                      <div className="job-expand-progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className="detail-meta-key">Elapsed</td>
                <td className="detail-meta-val">{formatElapsed(job.started_at, job.completed_at, job.status)}</td>
              </tr>
              <tr>
                <td className="detail-meta-key">Branch</td>
                <td className="detail-meta-val">
                  {job.branch ? (
                    <a href={`https://github.com/zazig-team/zazigv2/tree/${job.branch}`} target="_blank" rel="noreferrer">
                      {job.branch}
                    </a>
                  ) : "—"}
                </td>
              </tr>
              <tr>
                <td className="detail-meta-key">Status</td>
                <td className="detail-meta-val">
                  <span className={statusBadgeClass(job.status)}>{job.status.replace(/_/g, " ")}</span>
                </td>
              </tr>
              {job.blocked_reason ? (
                <tr>
                  <td className="detail-meta-key">Blocked</td>
                  <td className="detail-meta-val">{job.blocked_reason}</td>
                </tr>
              ) : null}
            </tbody>
          </table>

          {hasResultSummary ? (
            <div className="detail-section">
              <div className="detail-section-title">Result Summary</div>
              <div className="detail-prose detail-prose--pre">
                {showFullResult || resultText.length <= 200 ? (resultText || "—") : resultPreview}
              </div>
              {resultText.length > 200 ? (
                <button
                  className="archetype-change"
                  type="button"
                  onClick={() => setShowFullResult((current) => !current)}
                  style={{ marginTop: "8px" }}
                >
                  {showFullResult ? "Show less" : "Show more"}
                </button>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}

      <div className="detail-section">
        <div className="detail-section-title">Logs</div>

        <div className="job-expand-log-tabs">
          <button
            className={`job-expand-log-tab${activeTab === "lifecycle" ? " job-expand-log-tab--active" : ""}`}
            type="button"
            onClick={() => setActiveTab("lifecycle")}
          >
            Lifecycle
          </button>
          <button
            className={`job-expand-log-tab${activeTab === "tmux" ? " job-expand-log-tab--active" : ""}`}
            type="button"
            onClick={() => setActiveTab("tmux")}
          >
            Tmux
          </button>
        </div>

        {loadingLogs ? (
          <div className="detail-loading">Loading logs...</div>
        ) : logError ? (
          <div className="detail-error">{logError}</div>
        ) : (
          <div ref={logContainerRef} className="job-expand-log">
            {logs[activeTab] || "No logs available."}
          </div>
        )}
      </div>
    </div>
  );
}
