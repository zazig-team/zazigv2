import { useEffect, useRef, useState } from "react";
import {
  fetchFeatureDetail,
  diagnoseFeature,
  fetchJobResult,
  requestFeatureFix,
  type ErrorAnalysis,
  type FeatureDetail,
} from "../lib/queries";
import { supabase } from "../lib/supabase";
import { useCompany } from "../hooks/useCompany";
import FormattedProse from "./FormattedProse";
import JobDetailExpand from "./JobDetailExpand";

interface FeatureDetailPanelProps {
  featureId: string;
  colorVar: string;
  onClose: () => void;
}

function statusBadgeClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "detail-badge detail-badge--positive";
  if (s === "failed" || s === "cancelled") return "detail-badge detail-badge--negative";
  if (s === "building" || s === "breaking_down" || s === "verifying") return "detail-badge detail-badge--active";
  if (s === "proposal" || s === "ready") return "detail-badge detail-badge--caution";
  return "detail-badge";
}

function jobDotColor(status: string): string {
  const s = status.toLowerCase();
  if (s === "executing" || s === "running" || s === "in_progress") return "var(--caution)";
  if (s === "queued") return "var(--caution)";
  if (s === "failed") return "var(--negative)";
  if (s === "complete") return "var(--positive)";
  return "var(--chalk)";
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

type DiagnosisState =
  | { phase: "idle" }
  | { phase: "commissioning" }
  | { phase: "running"; jobId: string; dots: number }
  | { phase: "done"; report: string }
  | { phase: "error"; message: string };

type JobErrorBadge = {
  className: string;
  label: string;
};

function getJobErrorBadge(errorAnalysis: ErrorAnalysis | null | undefined): JobErrorBadge | null {
  const errors = errorAnalysis?.errors ?? [];
  if (!((errorAnalysis?.errors?.length ?? 0) > 0)) {
    return null;
  }

  const criticalCount = errors.filter((error) => error.severity === "critical").length;
  const className = criticalCount > 0
    ? "detail-job-error-badge detail-job-error-badge--critical-red"
    : "detail-job-error-badge detail-job-error-badge--warning-caution";

  return {
    className,
    label: `${errors.length} error${errors.length === 1 ? "" : "s"}`,
  };
}

export default function FeatureDetailPanel({ featureId, colorVar, onClose }: FeatureDetailPanelProps): JSX.Element {
  const [data, setData] = useState<FeatureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisState>({ phase: "idle" });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [retried, setRetried] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const { activeCompanyId } = useCompany();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const result = await fetchFeatureDetail(featureId);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [featureId]);

  useEffect(() => {
    setDiagnosis({ phase: "idle" });
    setRetrying(false);
    setRetryError(null);
    setRetried(false);
    setSelectedJobId(null);
  }, [featureId]);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      if (selectedJobId) {
        setSelectedJobId(null);
        return;
      }
      onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose, selectedJobId]);

  async function startDiagnosis(): Promise<void> {
    if (!activeCompanyId || !data) return;

    setDiagnosis({ phase: "commissioning" });

    try {
      const { job_id } = await diagnoseFeature({
        companyId: activeCompanyId,
        featureId: data.id,
      });

      setDiagnosis({ phase: "running", jobId: job_id, dots: 0 });

      // Poll for completion
      let dotCount = 0;
      pollRef.current = setInterval(async () => {
        try {
          const { status, result } = await fetchJobResult(job_id);

          if (status === "complete" && result) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setDiagnosis({ phase: "done", report: result });
          } else if (status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setDiagnosis({ phase: "done", report: result ?? "Diagnosis agent failed — no report produced." });
          } else {
            dotCount = (dotCount + 1) % 4;
            setDiagnosis({ phase: "running", jobId: job_id, dots: dotCount });
          }
        } catch {
          // Polling error — keep trying
        }
      }, 4000);
    } catch (err) {
      setDiagnosis({ phase: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  function diagnosisLabel(state: DiagnosisState): string {
    if (state.phase === "commissioning") return "Commissioning diagnostician...";
    if (state.phase === "running") return `Agent diagnosing${".".repeat(state.dots + 1)}`;
    return "";
  }

  async function reloadFeature(): Promise<void> {
    try {
      const result = await fetchFeatureDetail(featureId);
      setData(result);
    } catch {
      // ignore reload errors
    }
  }

  return (
    <>
      <div className="detail-backdrop" onClick={onClose} />
      <div className={data?.pr_url ? "detail-panel detail-panel--has-pr-link" : "detail-panel"}>
        {loading ? (
          <div className="detail-body"><div className="detail-loading">Loading...</div></div>
        ) : error ? (
          <div className="detail-body"><div className="detail-error">{error}</div></div>
        ) : data ? (
          <>
            <div className="detail-header">
              <span className="detail-dot" style={{ background: `var(${colorVar})` }} />
              <div className="detail-header-text">
                <div className="detail-title">{data.title}</div>
                <span className={statusBadgeClass(data.status)}>{data.status.replace(/_/g, " ")}</span>
              </div>
              <button className="detail-close" type="button" onClick={onClose}>×</button>
            </div>

            <div className="detail-body">
              <table className="detail-meta-table">
                <tbody>
                  <tr><td className="detail-meta-key">ID</td><td className="detail-meta-val">{data.id}</td></tr>
                  {data.priority ? <tr><td className="detail-meta-key">Priority</td><td className="detail-meta-val">{data.priority}</td></tr> : null}
                  {data.branch ? <tr><td className="detail-meta-key">Branch</td><td className="detail-meta-val">{data.branch}</td></tr> : null}
                  {data.created_by ? <tr><td className="detail-meta-key">Created by</td><td className="detail-meta-val">{data.created_by}</td></tr> : null}
                  {data.verification_type ? <tr><td className="detail-meta-key">Verification</td><td className="detail-meta-val">{data.verification_type}</td></tr> : null}
                  <tr><td className="detail-meta-key">Created</td><td className="detail-meta-val">{formatDate(data.created_at)}</td></tr>
                  {data.completed_at ? <tr><td className="detail-meta-key">Completed</td><td className="detail-meta-val">{formatDate(data.completed_at)}</td></tr> : null}
                </tbody>
              </table>

              {data.staging_verified_by ? (
                <div className="detail-section">
                  <div className="detail-badge--positive detail-staging-verified">
                    Verified by {data.staging_verified_by}
                    <button type="button" className="detail-unverify-btn" onClick={async () => { await supabase.from("features").update({ staging_verified_by: null, staging_verified_at: null }).eq("id", data.id); await reloadFeature(); }}>×</button>
                  </div>
                </div>
              ) : null}
              {data.status === "complete" && !data.promoted_version && !data.staging_verified_by ? (
                <div className="detail-section">
                  <button type="button" className="promote-btn" onClick={async () => {
                    const name = prompt("Enter your name to mark as verified on staging:");
                    if (!name?.trim()) return;
                    await supabase.from("features").update({ staging_verified_by: name.trim(), staging_verified_at: new Date().toISOString() }).eq("id", data.id);
                    await reloadFeature();
                  }}>Mark verified on staging</button>
                </div>
              ) : null}

              {data.sourceIdea ? (
                <div className="detail-section">
                  <div className="detail-section-title">Source Idea</div>
                  <div className="detail-linked-card">
                    <div className="detail-linked-title">{data.sourceIdea.title}</div>
                    {data.sourceIdea.promoted_at ? (
                      <div className="detail-linked-meta">Promoted {formatDate(data.sourceIdea.promoted_at)}</div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {data.description ? (
                <div className="detail-section">
                  <div className="detail-section-title">Description</div>
                  <FormattedProse text={data.description} />
                </div>
              ) : null}

              {data.jobs.length > 0 ? (
                <div className="detail-section">
                  <div className="detail-section-title">Jobs ({data.jobs.length})</div>
                    <div className="detail-jobs">
                      {data.jobs.map((job, index) => {
                        const errorBadge = getJobErrorBadge(job.error_analysis);
                        return (
                          <div
                            key={job.id}
                            className="detail-job-row"
                            onClick={() => setSelectedJobId(job.id)}
                            style={{
                              cursor: "pointer",
                              borderBottom: index === data.jobs.length - 1 ? "none" : undefined,
                            }}
                          >
                            <span className="detail-job-dot" style={{ background: jobDotColor(job.status) }} />
                            <div className="detail-job-info">
                              <div className="detail-job-title-row">
                                <span className="detail-job-title">{job.title}</span>
                                {errorBadge ? (
                                  <span className={errorBadge.className}>{errorBadge.label}</span>
                                ) : null}
                              </div>
                              <div className="detail-job-id">{job.id}</div>
                              <div className="detail-job-meta">{job.status} · {job.role}{job.model ? ` · ${job.model}` : ""}</div>
                            </div>
                            <span aria-hidden="true">▶</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

              {data.spec ? (
                <div className="detail-section">
                  <div className="detail-section-title">Spec</div>
                  <FormattedProse text={data.spec} preformatted />
                </div>
              ) : null}

              {data.acceptance_tests ? (
                <div className="detail-section">
                  <div className="detail-section-title">Acceptance Tests</div>
                  <FormattedProse text={data.acceptance_tests} preformatted />
                </div>
              ) : null}

              {data.status === "failed" ? (
                <div className="promote-section">
                  <div className="detail-section-title">Diagnosis & Retry</div>

                  {retried ? (
                    <div className="promote-success">Fix job queued — feature moved back to building</div>
                  ) : diagnosis.phase === "idle" ? (
                    <button
                      className="diagnose-btn"
                      type="button"
                      disabled={!activeCompanyId}
                      onClick={startDiagnosis}
                    >
                      Diagnose Failure
                    </button>
                  ) : diagnosis.phase === "commissioning" || diagnosis.phase === "running" ? (
                    <div className="diagnosis-running">
                      <div className="diagnosis-spinner" />
                      <span>{diagnosisLabel(diagnosis)}</span>
                    </div>
                  ) : diagnosis.phase === "error" ? (
                    <>
                      <div className="promote-error">{diagnosis.message}</div>
                      <button className="diagnose-btn" type="button" onClick={startDiagnosis}>
                        Try Again
                      </button>
                    </>
                  ) : diagnosis.phase === "done" ? (
                    <>
                      <div className="diagnosis-box">
                        <FormattedProse text={diagnosis.report} preformatted />
                      </div>

                      {retryError ? (
                        <div className="promote-error">{retryError}</div>
                      ) : null}

                      <button
                        className="promote-btn"
                        type="button"
                        disabled={retrying || !activeCompanyId}
                        onClick={async () => {
                          if (!activeCompanyId) return;
                          setRetrying(true);
                          setRetryError(null);
                          try {
                            await requestFeatureFix({
                              companyId: activeCompanyId,
                              featureId: data.id,
                              reason: diagnosis.report,
                            });
                            setRetried(true);
                          } catch (err) {
                            setRetryError(err instanceof Error ? err.message : String(err));
                          } finally {
                            setRetrying(false);
                          }
                        }}
                      >
                        {retrying ? "Retrying..." : "Retry with Fix"}
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
            {data.pr_url ? (
              <a className="detail-pr-fab" href={data.pr_url} target="_blank" rel="noopener noreferrer">
                View PR ↗
              </a>
            ) : null}
          </>
        ) : null}
      </div>
      {selectedJobId ? (
        <div className="detail-fullscreen">
          <div className="detail-header">
            <button className="detail-back-button" type="button" onClick={() => setSelectedJobId(null)}>
              ← Back to feature
            </button>
            <div className="detail-header-text">
              <div className="detail-title">Job Detail</div>
              <div className="detail-job-id">{selectedJobId}</div>
            </div>
            <button className="detail-close" type="button" onClick={onClose}>×</button>
          </div>
          <div className="detail-body">
            <JobDetailExpand jobId={selectedJobId} />
          </div>
        </div>
      ) : null}
    </>
  );
}
