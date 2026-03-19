import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCompany } from "../hooks/useCompany";
import { usePolling } from "../hooks/usePolling";
import { useRealtimeTable } from "../hooks/useRealtimeTable";
import {
  fetchIdeas,
  fetchIdeaDetail,
  fetchProjects,
  promoteIdea,
  updateIdeaStatus,
  updateIdeaWithNote,
  requestHeadlessTriage,
  requestHeadlessSpec,
  requestEnrichmentJob,
  appendFounderInput,
  type Idea,
  type IdeaDetail,
  type Project,
} from "../lib/queries";
import { supabase } from "../lib/supabase";
import FormattedProse from "../components/FormattedProse";

type TypeFilter = "all" | "idea" | "brief" | "bug" | "test";
type SectionTab = "inbox" | "triaged" | "developing" | "workshop" | "parked" | "rejected" | "shipped" | "done";
type SortMode = "newest" | "oldest" | "priority";
type TriagedSubsection = "readyForSpec" | "needsDecision";
type ToastTone = "success" | "info" | "error";
type BatchTriageState = "idle" | "queued" | "triaging" | "done";
type BatchSpecState = "idle" | "queued" | "speccing" | "done" | "timed_out";

interface BatchToast {
  id: string;
  tone: ToastTone;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

const TYPE_ICON: Record<string, string> = {
  idea: "\u{1F4A1}",
  brief: "\u{1F4CB}",
  bug: "\u{1F41B}",
  test: "\u{1F9EA}",
};

const TYPE_COLOR_VAR: Record<string, string> = {
  idea: "--col-ideas",
  brief: "--col-brief",
  bug: "--col-bug",
  test: "--col-test",
};

function ageLabel(createdAt: string): string {
  const ms = Date.now() - new Date(createdAt).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function priorityLabel(priority: string | null): string {
  const p = (priority ?? "medium").toLowerCase();
  if (p === "urgent") return "urgent";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "med";
}

function priorityClass(priority: string | null): string {
  const p = (priority ?? "medium").toLowerCase();
  if (p === "urgent") return "il-priority urgent";
  if (p === "high") return "il-priority high";
  if (p === "low") return "il-priority low";
  return "il-priority medium";
}

function sourceLabel(idea: Idea): string {
  if (idea.originator) {
    const lower = idea.originator.toLowerCase();
    if (lower.includes("slack")) return "slack";
    if (lower.includes("telegram")) return "telegram";
    if (lower.includes("agent") || lower.includes("cpo") || lower.includes("monitoring")) return "agent";
    if (lower.includes("web")) return "web";
  }
  return "terminal";
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
const INBOX_LEAVE_MS = 260;
const SPEC_POLL_INTERVAL_MS = 5000;
const SPEC_TIMEOUT_MS = 5 * 60 * 1000;

function priorityRank(priority: string | null): number {
  return PRIORITY_RANK[(priority ?? "medium").toLowerCase()] ?? 2;
}

function sortIdeasByMode(items: Idea[], sortMode: SortMode): Idea[] {
  const sorted = [...items];
  if (sortMode === "oldest") {
    sorted.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  } else if (sortMode === "newest") {
    sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else if (sortMode === "priority") {
    sorted.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }
  return sorted;
}

function isReadyForSpecRoute(triageRoute: string | null | undefined): boolean {
  return triageRoute === "develop" || triageRoute === "promote";
}

function featureStatusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

function featureStatusClass(status: string): string {
  const s = status.toLowerCase();
  if (s === "complete" || s === "shipped") return "il-feature-status positive";
  if (s === "failed" || s === "cancelled") return "il-feature-status negative";
  if (s === "building" || s === "verifying") return "il-feature-status active";
  return "il-feature-status";
}

/* ── Inline Detail (expanded row content) ── */

const STATUS_LABELS: Record<string, string> = {
  new: "Inbox",
  triaging: "Analysing",
  triaged: "Triaged",
  developing: "Spec In Progress",
  specced: "Specced",
  parked: "Parked",
  rejected: "Rejected",
  promoted: "Promoted",
  done: "Done",
  workshop: "Workshop",
};

const TAB_LABELS: Record<SectionTab, string> = {
  inbox: "Inbox",
  triaged: "Triaged",
  developing: "Spec In Progress",
  workshop: "Workshop",
  parked: "Parked",
  rejected: "Rejected",
  shipped: "Shipped",
  done: "Done",
};

interface InlineDetailProps {
  ideaId: string;
  colorVar: string;
  isShipped: boolean;
  triagedSubsection?: TriagedSubsection;
  onAction: (ideaId: string, newStatus: string) => void;
  onSpecStateChange: (ideaId: string, state: BatchSpecState) => void;
}

function InlineDetail({ ideaId, colorVar, isShipped, triagedSubsection, onAction, onSpecStateChange }: InlineDetailProps): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [data, setData] = useState<IdeaDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Promote state
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [promoteError, setPromoteError] = useState<string | null>(null);
  const [promoted, setPromoted] = useState(false);
  const [markingDone, setMarkingDone] = useState(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);
  const [doneNote, setDoneNote] = useState("");
  const [doneError, setDoneError] = useState<string | null>(null);

  // Action state (triage/park/reject/enrich)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [parkConfirm, setParkConfirm] = useState(false);
  const [showTriagedNoteComposer, setShowTriagedNoteComposer] = useState(false);
  const [triagedNote, setTriagedNote] = useState("");
  const [savingTriagedNote, setSavingTriagedNote] = useState(false);
  const [triagedNoteError, setTriagedNoteError] = useState<string | null>(null);
  const [triagedNoteSaved, setTriagedNoteSaved] = useState(false);
  const [founderInput, setFounderInput] = useState("");
  const [founderSubmitting, setFounderSubmitting] = useState(false);
  const [founderError, setFounderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPromoted(false);
    setShowDoneConfirm(false);
    setDoneNote("");
    setDoneError(null);
    setParkConfirm(false);
    setShowTriagedNoteComposer(false);
    setTriagedNote("");
    setTriagedNoteError(null);
    setTriagedNoteSaved(false);

    fetchIdeaDetail(ideaId).then((result) => {
      if (!cancelled) {
        setData(result);
        setTriagedNote(result.triage_notes ?? "");
        if (result.project_id) setSelectedProjectId(result.project_id);
      }
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [ideaId]);

  // Load projects for triaged ideas (promote) and new ideas (triage job needs project_id)
  useEffect(() => {
    if (!activeCompanyId || !data || !["triaged", "specced", "developing", "new"].includes(data.status)) return;
    let cancelled = false;

    fetchProjects(activeCompanyId).then((result) => {
      if (!cancelled) {
        setProjects(result);
        if (!selectedProjectId && result.length === 1) {
          setSelectedProjectId(result[0].id);
        }
      }
    }).catch(() => {});

    return () => { cancelled = true; };
  }, [activeCompanyId, data?.status]);

  async function handlePromote(): Promise<void> {
    if (!data || !selectedProjectId) return;
    setPromoting(true);
    setPromoteError(null);

    try {
      await promoteIdea({
        ideaId: data.id,
        promoteTo: "feature",
        projectId: selectedProjectId,
        title: data.title ?? undefined,
      });
      setPromoted(true);
      onAction(ideaId, "promoted");
    } catch (err) {
      setPromoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromoting(false);
    }
  }

  async function handleAction(newStatus: string, label: string): Promise<void> {
    setActionInProgress(label);
    setActionError(null);
    try {
      await updateIdeaStatus(ideaId, newStatus);
      setActionDone(label);
      onAction(ideaId, newStatus);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleMarkDone(): Promise<void> {
    if (!data) return;
    setMarkingDone(true);
    setDoneError(null);
    try {
      await updateIdeaWithNote(data.id, "done", doneNote || undefined);
      onAction(ideaId, "done");
    } catch (err) {
      setDoneError(err instanceof Error ? err.message : String(err));
    } finally {
      setMarkingDone(false);
    }
  }

  async function handleBackgroundTriage(): Promise<void> {
    if (!activeCompanyId) return;
    const projectId = selectedProjectId ?? projects[0]?.id;
    if (!projectId) {
      setActionError("No project available for triage");
      return;
    }
    setActionInProgress("Triage");
    setActionError(null);
    try {
      await updateIdeaStatus(ideaId, "triaging");
      const triageResult = await requestHeadlessTriage({
        companyId: activeCompanyId,
        projectId,
        ideaIds: [ideaId],
      });
      if (!triageResult.ok) {
        // Revert to 'new' on dispatch failure
        await updateIdeaStatus(ideaId, "new").catch(() => {});
        setActionError(triageResult.error);
        return;
      }
      setActionDone("Triage");
      onAction(ideaId, "triaging");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleWriteSpec(): Promise<void> {
    if (!activeCompanyId) return;
    const projectId = selectedProjectId ?? projects[0]?.id;
    if (!projectId) {
      setActionError("No project available for spec");
      return;
    }
    const batchId = crypto.randomUUID();
    setActionInProgress("Spec");
    setActionError(null);
    onSpecStateChange(ideaId, "speccing");
    let claimedIdea = false;
    try {
      const { data: claimedRows, error: claimError } = await supabase
        .from("ideas")
        .update({ status: "developing" })
        .eq("id", ideaId)
        .eq("status", "triaged")
        .select("id");

      if (claimError) {
        throw claimError;
      }

      const claimedCount = claimedRows?.length ?? 0;
      if (claimedCount === 0) {
        onSpecStateChange(ideaId, "idle");
        setActionError("Idea was already claimed by another process.");
        return;
      }
      claimedIdea = true;

      await requestHeadlessSpec({
        companyId: activeCompanyId,
        projectId,
        ideaIds: [ideaId],
        batchId,
      });
    } catch (err) {
      onSpecStateChange(ideaId, "idle");
      if (claimedIdea) {
        await supabase
          .from("ideas")
          .update({ status: "triaged" })
          .eq("id", ideaId)
          .eq("status", "developing");
      }
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionInProgress(null);
    }
  }

  if (loading) return <div className="il-detail-loading">Loading...</div>;
  if (error) return <div className="il-detail-error">{error}</div>;
  if (!data) return <div className="il-detail-loading">No data</div>;

  const canPromote = data.status === "specced" && !promoted && !isShipped;
  const canSendToSpec = data.status === "triaged" && !promoted && !isShipped;
  const isTriagedReadyForSpecView = triagedSubsection === "readyForSpec";
  const isTriagedNeedsDecisionView = triagedSubsection === "needsDecision";
  const readiness = canPromote ? [
    { label: "Has title", ok: Boolean(data.title?.trim()), hint: "Needs a clear title", field: "title" },
    { label: "Has description", ok: Boolean(data.description?.trim()) || Boolean(data.raw_text && data.raw_text.length > 20), hint: "Needs description or detailed raw text", field: "description" },
    { label: "Has project", ok: Boolean(selectedProjectId ?? data.project_id), hint: "Select a project below", field: "project" },
  ] : [];
  const specReadiness = canPromote ? [
    { label: "Has spec", ok: Boolean(data.spec?.trim()), hint: "Spec content is missing" },
    { label: "Has acceptance tests", ok: Boolean(data.acceptance_tests?.trim()), hint: "Acceptance tests are missing" },
  ] : [];
  const readinessChecks = [...readiness, ...specReadiness];
  const allReady = readiness.every((r) => r.ok);
  const missingFields = readiness.filter((r) => !r.ok && r.field !== "project").map((r) => r.field);

  async function handleEnrich(): Promise<void> {
    if (!activeCompanyId || missingFields.length === 0) return;
    const projectId = selectedProjectId ?? projects[0]?.id;
    if (!projectId) {
      setActionError("No project available for enrichment job");
      return;
    }
    setEnriching(true);
    setActionError(null);
    try {
      await requestEnrichmentJob({ companyId: activeCompanyId, projectId, ideaId: data!.id, missing: missingFields });
      setActionDone("Enrich");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setEnriching(false);
    }
  }

  async function handleSaveTriagedNote(): Promise<void> {
    if (!data) return;
    if (!triagedNote.trim()) {
      setTriagedNoteError("Enter a note before saving.");
      return;
    }

    setSavingTriagedNote(true);
    setTriagedNoteError(null);
    setTriagedNoteSaved(false);
    try {
      await updateIdeaWithNote(data.id, data.status, triagedNote);
      setData((prev) => prev ? { ...prev, triage_notes: triagedNote.trim() } : prev);
      setShowTriagedNoteComposer(false);
      setTriagedNoteSaved(true);
    } catch (err) {
      setTriagedNoteError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingTriagedNote(false);
    }
  }

  async function handleFounderInputSubmit(): Promise<void> {
    if (!data) return;
    if (founderSubmitting) return;
    const trimmedInput = founderInput.trim();
    if (!trimmedInput) return;

    setFounderSubmitting(true);
    setFounderError(null);

    const mergedNotes = data.triage_notes && data.triage_notes.length > 0
      ? `${data.triage_notes}\n\nFOUNDER INPUT: ${trimmedInput}`
      : `FOUNDER INPUT: ${trimmedInput}`;

    try {
      await appendFounderInput(data.id, trimmedInput, data.triage_notes);
      setData((prev) => prev ? { ...prev, triage_notes: mergedNotes } : prev);
      setFounderInput("");
    } catch (err) {
      setFounderError(err instanceof Error ? err.message : String(err));
    } finally {
      setFounderSubmitting(false);
    }
  }

  return (
    <div className="il-detail">
      <div className="il-detail-divider" />

      {/* Description / Raw text */}
      <div className="il-detail-text">
        <FormattedProse text={data.description && data.description !== data.raw_text ? data.description : data.raw_text} />
      </div>

      {/* Metadata */}
      <div className="il-detail-meta-row">
        {data.source && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Source</span>
            <span className="il-detail-meta-val">{data.source}</span>
          </div>
        )}
        {data.originator && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Originator</span>
            <span className="il-detail-meta-val">{data.originator}</span>
          </div>
        )}
        <div className="il-detail-meta-item">
          <span className="il-detail-meta-key">Created</span>
          <span className="il-detail-meta-val">{formatDate(data.created_at)}</span>
        </div>
        {data.item_type && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Type</span>
            <span className="il-detail-meta-val">{data.item_type}</span>
          </div>
        )}
        {data.priority && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Priority</span>
            <span className="il-detail-meta-val">{data.priority}</span>
          </div>
        )}
        {data.horizon && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Horizon</span>
            <span className="il-detail-meta-val">{data.horizon}</span>
          </div>
        )}
        {data.promoted_at && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Promoted</span>
            <span className="il-detail-meta-val">{formatDate(data.promoted_at)}</span>
          </div>
        )}
        {typeof data.spec_url === "string" && data.spec_url.trim() && (
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Spec</span>
            <a className="il-detail-link" href={data.spec_url} target="_blank" rel="noopener noreferrer">View Spec</a>
          </div>
        )}
      </div>

      {/* Tags */}
      {data.tags && data.tags.length > 0 && (
        <div className="il-detail-tags">
          {data.tags.map((tag) => <span className="il-detail-tag" key={tag}>{tag}</span>)}
        </div>
      )}

      {/* Triage notes (from background triage agent) */}
      {data.triage_notes && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Triage Notes</div>
          <div className="il-detail-text">
            <FormattedProse text={data.triage_notes} />
          </div>
          {data.suggested_exec && (
            <div className="il-detail-meta-item" style={{ marginTop: 6 }}>
              <span className="il-detail-meta-key">Suggested exec</span>
              <span className="il-detail-meta-val">{data.suggested_exec}</span>
            </div>
          )}
        </div>
      )}

      {(data.status === "triaged" || data.status === "developing") && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Founder Input</div>
          <textarea
            className="il-founder-textarea"
            rows={3}
            value={founderInput}
            onChange={(e) => {
              setFounderInput(e.target.value);
              if (founderError) setFounderError(null);
            }}
            disabled={founderSubmitting}
            placeholder="Add context, constraints, or directional input..."
            aria-label="Founder input"
          />
          {founderError && <div className="il-founder-error">{founderError}</div>}
          <div className="il-founder-actions">
            <button
              className="il-action-primary"
              type="button"
              disabled={founderSubmitting || founderInput.trim().length === 0}
              onClick={handleFounderInputSubmit}
            >
              {founderSubmitting ? "Submitting..." : "Add Founder Input"}
            </button>
          </div>
        </div>
      )}

      {/* Triage route */}
      {data.triage_route && (
        <div className="il-detail-meta-row">
          <div className="il-detail-meta-item">
            <span className="il-detail-meta-key">Triage Route</span>
            <span className="il-detail-meta-val">{data.triage_route}</span>
          </div>
          {data.complexity && (
            <div className="il-detail-meta-item">
              <span className="il-detail-meta-key">Complexity</span>
              <span className="il-detail-meta-val">{data.complexity}</span>
            </div>
          )}
        </div>
      )}

      {/* Spec (from spec expert) */}
      {data.spec && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Spec</div>
          <div className="il-detail-text">
            <FormattedProse text={data.spec} />
          </div>
        </div>
      )}

      {/* Acceptance criteria */}
      {data.acceptance_tests && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Acceptance Criteria</div>
          <div className="il-detail-text">
            <FormattedProse text={data.acceptance_tests} />
          </div>
        </div>
      )}

      {/* Human checklist */}
      {data.human_checklist && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Human Checklist</div>
          <div className="il-detail-text">
            <FormattedProse text={data.human_checklist} />
          </div>
        </div>
      )}

      {/* Clarification notes */}
      {data.clarification_notes && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Clarification Notes</div>
          <div className="il-detail-text">
            <FormattedProse text={data.clarification_notes} />
          </div>
        </div>
      )}

      {/* Promoted feature link */}
      {data.promotedFeature && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Promoted To</div>
          <div className="il-detail-linked">
            <span className="il-detail-linked-title">{data.promotedFeature.title}</span>
            <span className="il-detail-linked-status">{data.promotedFeature.status.replace(/_/g, " ")}</span>
          </div>
        </div>
      )}

      {/* Promote to pipeline */}
      {canPromote && (
        <div className="il-detail-section">
          <div className="il-detail-section-label">Push to Pipeline</div>
          <div className="il-promote-readiness">
            {readinessChecks.map((r) => (
              <div className="il-promote-check" key={r.label}>
                <span className={r.ok ? "il-promote-icon ok" : "il-promote-icon missing"}>
                  {r.ok ? "\u2713" : "\u2717"}
                </span>
                <span>{r.label}</span>
                {!r.ok && r.hint && <span className="il-promote-hint">{r.hint}</span>}
              </div>
            ))}
          </div>

          {projects.length > 0 && (
            <div className="il-promote-project">
              <label className="il-promote-label" htmlFor={`promote-project-${ideaId}`}>Project</label>
              <select
                id={`promote-project-${ideaId}`}
                className="il-promote-select"
                value={selectedProjectId ?? ""}
                onChange={(e) => setSelectedProjectId(e.target.value || null)}
              >
                <option value="">Select project...</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}

          {promoteError && <div className="il-promote-error">{promoteError}</div>}

          <div className="il-promote-actions">
            <button
              className="il-action-primary"
              type="button"
              disabled={!allReady || promoting}
              onClick={handlePromote}
            >
              {promoting ? "Promoting..." : "Promote to Feature"}
            </button>
            <button
              className="il-action-secondary il-action-done"
              type="button"
              disabled={promoting || markingDone}
              onClick={() => {
                setShowDoneConfirm(true);
                setDoneError(null);
              }}
            >
              Done
            </button>
            {missingFields.length > 0 && (
              <button
                className="il-action-secondary il-action-enrich"
                type="button"
                disabled={enriching}
                onClick={handleEnrich}
              >
                {enriching ? "Enriching..." : `Enrich (${missingFields.join(", ")})`}
              </button>
            )}
            <button
              className="il-action-secondary il-action-park"
              type="button"
              disabled={promoting || !!actionInProgress || parkConfirm}
              onClick={() => setParkConfirm(true)}
            >
              Park
            </button>
            <button
              className="il-action-secondary il-action-reject"
              type="button"
              disabled={promoting || !!actionInProgress}
              onClick={() => handleAction("rejected", "Reject")}
            >
              {actionInProgress === "Reject" ? "Rejecting..." : "Reject"}
            </button>
          </div>

          {showDoneConfirm && (
            <div className="il-done-confirm">
              <label className="il-promote-label" htmlFor={`done-note-${ideaId}`}>Note</label>
              <textarea
                id={`done-note-${ideaId}`}
                className="il-done-note"
                value={doneNote}
                onChange={(e) => setDoneNote(e.target.value)}
                placeholder="Add a note (optional)..."
                rows={3}
              />
              <div className="il-promote-actions">
                <button
                  className="il-action-secondary il-action-done"
                  type="button"
                  disabled={markingDone}
                  onClick={handleMarkDone}
                >
                  {markingDone ? "Marking..." : "Confirm Done"}
                </button>
                <button
                  className="il-action-secondary"
                  type="button"
                  disabled={markingDone}
                  onClick={() => {
                    setShowDoneConfirm(false);
                    setDoneNote("");
                    setDoneError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {doneError && <div className="il-promote-error">{doneError}</div>}
            </div>
          )}

          {parkConfirm && (
            <div
              className="il-park-confirm"
              style={{
                marginTop: 8,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid color-mix(in oklab, var(--hairline) 80%, var(--text-color) 20%)",
                background: "color-mix(in oklab, var(--panel-bg, #fff) 95%, var(--text-color, #000) 5%)",
                display: "grid",
                gap: 8,
              }}
            >
              <div style={{ fontSize: "0.9rem", opacity: 0.86 }}>
                Park this idea? It won&apos;t appear in the active list but can be recovered later.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  className="il-action-secondary il-action-park"
                  type="button"
                  disabled={!!actionInProgress}
                  onClick={() => {
                    void handleAction("parked", "Park");
                    setParkConfirm(false);
                  }}
                >
                  {actionInProgress === "Park" ? "Parking..." : "Confirm Park"}
                </button>
                <button
                  className="il-action-secondary"
                  type="button"
                  disabled={!!actionInProgress}
                  onClick={() => setParkConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {promoted && (
        <div className="il-promote-success">Idea promoted to feature and pushed into the pipeline.</div>
      )}

      {/* Actions row for items outside promote flow */}
      {!canPromote && !isShipped && !promoted && !actionDone && (
        <>
          <div className="il-detail-actions" style={{ flexWrap: "wrap" }}>
            {isTriagedReadyForSpecView ? (
              <>
                {canSendToSpec && (
                  <button className="il-action-primary il-action-triage-primary" type="button" disabled={!!actionInProgress} onClick={handleWriteSpec}>
                    {actionInProgress === "Spec" ? "Dispatching..." : "Send to Spec"}
                  </button>
                )}
                {data.status !== "parked" && data.status !== "rejected" && (
                  <button className="il-action-secondary il-action-park" type="button" disabled={!!actionInProgress} onClick={() => handleAction("parked", "Park")}>
                    {actionInProgress === "Park" ? "Parking..." : "Park"}
                  </button>
                )}
              </>
            ) : isTriagedNeedsDecisionView ? (
              <>
                {data.status !== "parked" && data.status !== "rejected" && (
                  <button className="il-action-secondary il-action-park" type="button" disabled={!!actionInProgress} onClick={() => handleAction("parked", "Park")}>
                    {actionInProgress === "Park" ? "Parking..." : "Park"}
                  </button>
                )}
                <button className="il-action-secondary il-action-workshop" type="button" disabled={!!actionInProgress} onClick={() => handleAction("workshop", "Workshop")}>
                  {actionInProgress === "Workshop" ? "Moving..." : "Workshop"}
                </button>
                <button
                  className="il-action-secondary"
                  type="button"
                  disabled={savingTriagedNote || !!actionInProgress}
                  onClick={() => {
                    setShowTriagedNoteComposer((prev) => !prev);
                    setTriagedNoteError(null);
                    setTriagedNoteSaved(false);
                  }}
                >
                  {showTriagedNoteComposer ? "Hide Note" : "Add Note"}
                </button>
              </>
            ) : (
              <>
                {data.status === "new" && (
                  <button className="il-action-secondary il-action-triage" type="button" disabled={!!actionInProgress} onClick={handleBackgroundTriage}>
                    {actionInProgress === "Triage" ? "Commissioning..." : "Triage"}
                  </button>
                )}
                {canSendToSpec && (
                  <button className="il-action-secondary il-action-triage" type="button" disabled={!!actionInProgress} onClick={handleWriteSpec}>
                    {actionInProgress === "Spec" ? "Dispatching..." : "Send to Spec"}
                  </button>
                )}
                {(data.status === "parked" || data.status === "rejected") && (
                  <button className="il-action-secondary il-action-restore" type="button" disabled={!!actionInProgress} onClick={() => handleAction("new", "Restore")}>
                    {actionInProgress === "Restore" ? "Restoring..." : "Restore to Inbox"}
                  </button>
                )}
                {data.status !== "parked" && data.status !== "rejected" && (
                  <button className="il-action-secondary il-action-park" type="button" disabled={!!actionInProgress} onClick={() => handleAction("parked", "Park")}>
                    {actionInProgress === "Park" ? "Parking..." : "Park"}
                  </button>
                )}
                {data.status !== "rejected" && data.status !== "parked" && (
                  <button className="il-action-secondary il-action-reject" type="button" disabled={!!actionInProgress} onClick={() => handleAction("rejected", "Reject")}>
                    {actionInProgress === "Reject" ? "Rejecting..." : "Reject"}
                  </button>
                )}
              </>
            )}
          </div>

          {isTriagedNeedsDecisionView && showTriagedNoteComposer && (
            <div className="il-done-confirm">
              <label className="il-promote-label" htmlFor={`triaged-note-${ideaId}`}>Note</label>
              <textarea
                id={`triaged-note-${ideaId}`}
                className="il-done-note"
                value={triagedNote}
                onChange={(e) => {
                  setTriagedNote(e.target.value);
                  setTriagedNoteSaved(false);
                }}
                placeholder="Add a triage note..."
                rows={2}
              />
              <div className="il-promote-actions" style={{ flexWrap: "wrap" }}>
                <button
                  className="il-action-secondary il-action-triage"
                  type="button"
                  disabled={savingTriagedNote || !triagedNote.trim()}
                  onClick={() => {
                    void handleSaveTriagedNote();
                  }}
                >
                  {savingTriagedNote ? "Saving..." : "Save Note"}
                </button>
                <button
                  className="il-action-secondary"
                  type="button"
                  disabled={savingTriagedNote}
                  onClick={() => {
                    setShowTriagedNoteComposer(false);
                    setTriagedNoteError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {triagedNoteError && <div className="il-promote-error">{triagedNoteError}</div>}
            </div>
          )}

          {isTriagedNeedsDecisionView && triagedNoteSaved && (
            <div className="il-promote-success">Note saved.</div>
          )}
        </>
      )}

      {actionError && <div className="il-promote-error">{actionError}</div>}
      {actionDone && <div className="il-promote-success">Idea {actionDone.toLowerCase()}d successfully.</div>}
    </div>
  );
}

/* ── Main Ideas Page ── */

export default function Ideas(): JSX.Element {
  const { activeCompanyId } = useCompany();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [promotedIdeas, setPromotedIdeas] = useState<Idea[]>([]);
  const [featureStatuses, setFeatureStatuses] = useState<Map<string, { title: string; status: string }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadedCompanyId, setLoadedCompanyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [activeTab, setActiveTab] = useState<SectionTab>("inbox");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("newest");
  const [dismissedIdeas, setDismissedIdeas] = useState<Map<string, string>>(new Map());
  const [batchTriageStates, setBatchTriageStates] = useState<Map<string, BatchTriageState>>(new Map());
  const [batchSpecStates, setBatchSpecStates] = useState<Map<string, BatchSpecState>>(new Map());
  const [retryingSpecIds, setRetryingSpecIds] = useState<Set<string>>(new Set());
  const [batchTriageErrors, setBatchTriageErrors] = useState<Map<string, string>>(new Map());
  const [leavingIdeas, setLeavingIdeas] = useState<Map<string, Idea>>(new Map());
  const [batchToasts, setBatchToasts] = useState<BatchToast[]>([]);
  const [staleCleanupToast, setStaleCleanupToast] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ideasByIdRef = useRef<Map<string, Idea>>(new Map());
  const leavingTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const batchToastTimeoutsRef = useRef<Map<string, number>>(new Map());
  const staleCleanupRunForCompanyRef = useRef<string | null>(null);
  const specStartTimesRef = useRef<Map<string, number>>(new Map());

  const dismissBatchToast = useCallback((id: string): void => {
    const timeoutId = batchToastTimeoutsRef.current.get(id);
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
      batchToastTimeoutsRef.current.delete(id);
    }
    setBatchToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showBatchToast = useCallback((
    {
      tone,
      message,
      actionLabel,
      onAction,
    }: Omit<BatchToast, "id">,
    autoDismissMs = 7000,
  ): void => {
    const id = crypto.randomUUID();
    setBatchToasts((prev) => [...prev, { id, tone, message, actionLabel, onAction }]);

    if (autoDismissMs > 0) {
      const timeoutId = window.setTimeout(() => {
        setBatchToasts((prev) => prev.filter((toast) => toast.id !== id));
        batchToastTimeoutsRef.current.delete(id);
      }, autoDismissMs);
      batchToastTimeoutsRef.current.set(id, timeoutId);
    }
  }, []);

  useEffect(() => {
    return () => {
      for (const timeoutId of batchToastTimeoutsRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      batchToastTimeoutsRef.current.clear();
    };
  }, []);

  const loadIdeas = useCallback(async () => {
    if (!activeCompanyId) return;
    try {
      const [activeData, promotedData] = await Promise.all([
        fetchIdeas(activeCompanyId),
        fetchIdeas(activeCompanyId, ["promoted"]),
      ]);
      setIdeas(activeData);
      setPromotedIdeas(promotedData);
      setError(null);

      const featureIds = promotedData
        .filter((i) => i.promoted_to_type === "feature" && i.promoted_to_id)
        .map((i) => i.promoted_to_id as string);

      if (featureIds.length > 0) {
        const { data } = await supabase
          .from("features")
          .select("id, title, status")
          .in("id", featureIds);

        const map = new Map<string, { title: string; status: string }>();
        for (const f of (data ?? []) as Array<{ id: string; title: string; status: string }>) {
          map.set(f.id, { title: f.title, status: f.status });
        }
        setFeatureStatuses(map);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
      setLoadedCompanyId(activeCompanyId);
    }
  }, [activeCompanyId]);

  useEffect(() => {
    void loadIdeas();
  }, [loadIdeas]);
  usePolling(loadIdeas, 15000, Boolean(activeCompanyId));

  useEffect(() => {
    ideasByIdRef.current = new Map(ideas.map((idea) => [idea.id, idea]));
  }, [ideas]);

  useEffect(() => {
    const developingIds = ideas
      .filter((idea) => idea.status === "developing")
      .map((idea) => idea.id);

    if (developingIds.length === 0) {
      return;
    }

    const now = Date.now();
    setBatchSpecStates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const ideaId of developingIds) {
        if (next.has(ideaId)) continue;
        next.set(ideaId, "speccing");
        changed = true;
      }
      return changed ? next : prev;
    });

    for (const ideaId of developingIds) {
      if (!specStartTimesRef.current.has(ideaId)) {
        specStartTimesRef.current.set(ideaId, now);
      }
    }
  }, [ideas]);

  const clearLeavingIdea = useCallback((ideaId: string) => {
    const timeoutId = leavingTimeoutsRef.current.get(ideaId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      leavingTimeoutsRef.current.delete(ideaId);
    }
    setLeavingIdeas((prev) => {
      if (!prev.has(ideaId)) return prev;
      const next = new Map(prev);
      next.delete(ideaId);
      return next;
    });
  }, []);

  const setIdeaSpecState = useCallback((ideaId: string, state: BatchSpecState): void => {
    if (state === "speccing") {
      specStartTimesRef.current.set(ideaId, Date.now());
    } else {
      specStartTimesRef.current.delete(ideaId);
    }

    setBatchSpecStates((prev) => {
      const hadIdea = prev.has(ideaId);
      if (!hadIdea && state === "idle") return prev;
      const next = new Map(prev);
      if (state === "idle") {
        next.delete(ideaId);
      } else {
        next.set(ideaId, state);
      }
      return next;
    });
  }, []);

  const markIdeaLeaving = useCallback((ideaId: string, opts?: { allowAnyStatus?: boolean }) => {
    const existing = ideasByIdRef.current.get(ideaId);
    if (!existing) return;
    if (!opts?.allowAnyStatus && existing.status !== "triaging") return;

    setLeavingIdeas((prev) => {
      if (prev.has(ideaId)) return prev;
      const next = new Map(prev);
      next.set(ideaId, existing);
      return next;
    });

    const priorTimeout = leavingTimeoutsRef.current.get(ideaId);
    if (priorTimeout) clearTimeout(priorTimeout);

    const timeoutId = setTimeout(() => {
      leavingTimeoutsRef.current.delete(ideaId);
      setLeavingIdeas((prev) => {
        if (!prev.has(ideaId)) return prev;
        const next = new Map(prev);
        next.delete(ideaId);
        return next;
      });
    }, INBOX_LEAVE_MS);
    leavingTimeoutsRef.current.set(ideaId, timeoutId);
  }, []);

  useEffect(() => () => {
    leavingTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    leavingTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    const doneIds = Array.from(batchSpecStates.entries())
      .filter(([, state]) => state === "done")
      .map(([ideaId]) => ideaId);
    if (doneIds.length === 0) return;

    const timeoutId = window.setTimeout(() => {
      setBatchSpecStates((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const ideaId of doneIds) {
          if (next.get(ideaId) === "done") {
            next.delete(ideaId);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [batchSpecStates]);

  useEffect(() => {
    if (!activeCompanyId) return;

    const speccingIdeaIds = Array.from(batchSpecStates.entries())
      .filter(([, state]) => state === "speccing")
      .map(([ideaId]) => ideaId);

    if (speccingIdeaIds.length === 0) return;

    let cancelled = false;

    const pollSpecStatuses = async (): Promise<void> => {
      const now = Date.now();
      const timedOutIds = speccingIdeaIds.filter((ideaId) => {
        const startedAt = specStartTimesRef.current.get(ideaId) ?? now;
        return now - startedAt > SPEC_TIMEOUT_MS;
      });

      if (timedOutIds.length > 0) {
        setBatchSpecStates((prev) => {
          let changed = false;
          const next = new Map(prev);
          for (const ideaId of timedOutIds) {
            if (next.get(ideaId) === "speccing") {
              next.set(ideaId, "timed_out");
              changed = true;
            }
          }
          return changed ? next : prev;
        });
        for (const ideaId of timedOutIds) {
          specStartTimesRef.current.delete(ideaId);
        }
      }

      const activeIdeaIds = speccingIdeaIds.filter((ideaId) => !timedOutIds.includes(ideaId));
      if (activeIdeaIds.length === 0) return;

      const { data, error } = await supabase
        .from("ideas")
        .select("id, status")
        .eq("company_id", activeCompanyId)
        .in("id", activeIdeaIds);

      if (cancelled || error || !data) return;

      const rows = data as Array<{ id: string; status: string }>;
      const statusById = new Map(rows.map((row) => [row.id, row.status]));

      setIdeas((prev) => {
        let changed = false;
        const next = prev.map((idea) => {
          const nextStatus = statusById.get(idea.id);
          if (!nextStatus || nextStatus === idea.status) return idea;
          changed = true;
          return { ...idea, status: nextStatus };
        });
        return changed ? next : prev;
      });

      setBatchSpecStates((prev) => {
        let changed = false;
        const next = new Map(prev);

        for (const ideaId of activeIdeaIds) {
          const status = statusById.get(ideaId);
          if (!status) {
            if (next.has(ideaId)) {
              next.delete(ideaId);
              changed = true;
            }
            specStartTimesRef.current.delete(ideaId);
            continue;
          }

          if (status === "specced") {
            if (next.get(ideaId) !== "done") {
              next.set(ideaId, "done");
              changed = true;
            }
            specStartTimesRef.current.delete(ideaId);
            continue;
          }

          if (status !== "developing") {
            if (next.has(ideaId)) {
              next.delete(ideaId);
              changed = true;
            }
            specStartTimesRef.current.delete(ideaId);
          }
        }

        return changed ? next : prev;
      });
    };

    void pollSpecStatuses();
    const intervalId = window.setInterval(() => {
      void pollSpecStatuses();
    }, SPEC_POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeCompanyId, batchSpecStates]);

  useEffect(() => {
    if (!activeCompanyId || loadedCompanyId !== activeCompanyId) return;
    if (staleCleanupRunForCompanyRef.current === activeCompanyId) return;
    staleCleanupRunForCompanyRef.current = activeCompanyId;

    let cancelled = false;

    void (async () => {
      try {
        const { data: triagingIdeas, error: triagingIdeasError } = await supabase
          .from("ideas")
          .select("id")
          .eq("company_id", activeCompanyId)
          .eq("status", "triaging");

        if (triagingIdeasError || !triagingIdeas?.length || cancelled) return;

        const triagingIdeaIds = triagingIdeas
          .map((idea) => idea.id)
          .filter((id): id is string => typeof id === "string");

        if (triagingIdeaIds.length === 0) return;

        const tenMinutesAgoIso = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: recentSessions, error: recentSessionsError } = await supabase
          .from("expert_sessions")
          .select("id, brief")
          .eq("company_id", activeCompanyId)
          .gt("created_at", tenMinutesAgoIso);

        if (recentSessionsError || cancelled) return;

        const recentSessionIds = (recentSessions ?? [])
          .map((session) => session.id)
          .filter((id): id is string => typeof id === "string");

        const activeTriagingIdeaIds = new Set<string>();
        for (const ideaId of triagingIdeaIds) {
          const hasRecentSession = (recentSessions ?? []).some((session) => (
            typeof session.brief === "string" && session.brief.includes(ideaId)
          ));
          if (hasRecentSession) {
            activeTriagingIdeaIds.add(ideaId);
          }
        }

        if (recentSessionIds.length > 0) {
          const { data: recentSessionItems, error: recentSessionItemsError } = await supabase
            .from("expert_session_items")
            .select("idea_id")
            .in("session_id", recentSessionIds)
            .in("idea_id", triagingIdeaIds);

          if (recentSessionItemsError || cancelled) return;

          for (const item of recentSessionItems ?? []) {
            if (typeof item.idea_id === "string") {
              activeTriagingIdeaIds.add(item.idea_id);
            }
          }
        }

        const staleIdeaIds = triagingIdeaIds.filter((ideaId) => !activeTriagingIdeaIds.has(ideaId));
        if (staleIdeaIds.length === 0 || cancelled) return;

        await Promise.all(staleIdeaIds.map((ideaId) => updateIdeaStatus(ideaId, "new")));
        if (!cancelled) {
          const suffix = staleIdeaIds.length === 1 ? "" : "s";
          setStaleCleanupToast(`Reverted ${staleIdeaIds.length} stale triaging idea${suffix} to new`);
        }
        await loadIdeas();
      } catch (cleanupError) {
        console.error("Failed to revert stale triaging ideas", cleanupError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeCompanyId, loadedCompanyId, loadIdeas]);

  useEffect(() => {
    if (!staleCleanupToast) return;
    const timeoutId = window.setTimeout(() => setStaleCleanupToast(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [staleCleanupToast]);

  // Realtime
  const handleInsert = useCallback((row: Record<string, unknown>) => {
    const idea = row as unknown as Idea;
    clearLeavingIdea(idea.id);
    if (idea.status === "promoted") {
      setPromotedIdeas((prev) => [idea, ...prev]);
    } else {
      setIdeas((prev) => [idea, ...prev]);
    }
  }, [clearLeavingIdea]);

  const handleUpdate = useCallback((row: Record<string, unknown>) => {
    const updated = row as unknown as Idea;
    const previous = ideasByIdRef.current.get(updated.id);
    const isBatchDone = batchTriageStates.get(updated.id) === "done";
    const shouldLeaveInbox = previous?.status === "triaging" && updated.status !== "triaging" && updated.status !== "new";
    if (shouldLeaveInbox) {
      markIdeaLeaving(updated.id);
      setExpandedId((prevExpanded) => (prevExpanded === updated.id ? null : prevExpanded));
    } else if ((updated.status === "triaging" || updated.status === "new") && !isBatchDone) {
      clearLeavingIdea(updated.id);
    }

    if (updated.status !== "new" && updated.status !== "triaging") {
      setBatchTriageStates((prev) => {
        if (!prev.has(updated.id)) return prev;
        const next = new Map(prev);
        next.delete(updated.id);
        return next;
      });
    }

    setBatchSpecStates((prev) => {
      if (!prev.has(updated.id)) return prev;
      const next = new Map(prev);
      if (updated.status === "specced") {
        next.set(updated.id, "done");
      } else if (updated.status !== "developing") {
        next.delete(updated.id);
      }
      return next;
    });
    if (updated.status === "specced" || updated.status !== "developing") {
      specStartTimesRef.current.delete(updated.id);
      setRetryingSpecIds((prev) => {
        if (!prev.has(updated.id)) return prev;
        const next = new Set(prev);
        next.delete(updated.id);
        return next;
      });
    }

    if (updated.status !== "new") {
      setBatchTriageErrors((prev) => {
        if (!prev.has(updated.id)) return prev;
        const next = new Map(prev);
        next.delete(updated.id);
        return next;
      });
    }

    if (updated.status === "promoted") {
      setIdeas((prev) => prev.filter((i) => i.id !== updated.id));
      setPromotedIdeas((prev) => {
        const exists = prev.some((i) => i.id === updated.id);
        return exists ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated, ...prev];
      });
    } else {
      setPromotedIdeas((prev) => prev.filter((i) => i.id !== updated.id));
      setIdeas((prev) => {
        const exists = prev.some((i) => i.id === updated.id);
        return exists ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated, ...prev];
      });
    }
  }, [batchTriageStates, clearLeavingIdea, markIdeaLeaving]);

  const handleDelete = useCallback((row: Record<string, unknown>) => {
    const id = (row as { id?: string }).id;
    if (id) {
      clearLeavingIdea(id);
      setBatchTriageStates((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBatchTriageErrors((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setBatchSpecStates((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      specStartTimesRef.current.delete(id);
      setRetryingSpecIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setIdeas((prev) => prev.filter((i) => i.id !== id));
      setPromotedIdeas((prev) => prev.filter((i) => i.id !== id));
    }
  }, [clearLeavingIdea]);

  useRealtimeTable({
    table: "ideas",
    filter: activeCompanyId ? `company_id=eq.${activeCompanyId}` : undefined,
    enabled: Boolean(activeCompanyId),
    onInsert: handleInsert,
    onUpdate: handleUpdate,
    onDelete: handleDelete,
  });

  // Filter by type
  const filtered = useMemo(() => {
    if (typeFilter === "all") return ideas;
    return ideas.filter((i) => i.item_type === typeFilter);
  }, [ideas, typeFilter]);

  const filteredPromoted = useMemo(() => {
    if (typeFilter === "all") return promotedIdeas;
    return promotedIdeas.filter((i) => i.item_type === typeFilter);
  }, [promotedIdeas, typeFilter]);

  const completedBatchIdeaIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [ideaId, state] of batchTriageStates.entries()) {
      if (state === "done") ids.add(ideaId);
    }
    return ids;
  }, [batchTriageStates]);

  // Group by section
  const sections = useMemo(() => ({
    inbox: filtered.filter((i) => (i.status === "new" || i.status === "triaging") && !completedBatchIdeaIds.has(i.id)),
    triaged: filtered.filter((i) => i.status === "triaged"),
    developing: filtered.filter((i) => i.status === "developing" || i.status === "specced"),
    workshop: filtered.filter((i) => i.status === "workshop"),
    parked: filtered.filter((i) => i.status === "parked"),
    rejected: filtered.filter((i) => i.status === "rejected"),
    shipped: filteredPromoted,
    done: filtered.filter((i) => i.status === "done"),
  }), [completedBatchIdeaIds, filtered, filteredPromoted]);

  const activeItems = useMemo(() => {
    const sorted = sortIdeasByMode(sections[activeTab], sortMode);
    if (activeTab !== "triaged") return sorted;
    const readyForSpec = sorted.filter((idea) => isReadyForSpecRoute(idea.triage_route));
    const remainingTriaged = sorted.filter((idea) => !isReadyForSpecRoute(idea.triage_route));
    return [...readyForSpec, ...remainingTriaged];
  }, [sections, activeTab, sortMode]);

  const displayedItems = useMemo(() => {
    if (activeTab !== "inbox" || leavingIdeas.size === 0) return activeItems;
    const ids = new Set(activeItems.map((idea) => idea.id));
    const leaving = Array.from(leavingIdeas.values()).filter((idea) => {
      if (ids.has(idea.id)) return false;
      if (typeFilter === "all") return true;
      return idea.item_type === typeFilter;
    });
    return [...activeItems, ...leaving];
  }, [activeTab, activeItems, leavingIdeas, typeFilter]);

  const visibleInboxNewIdeas = useMemo(() => {
    if (activeTab !== "inbox") return [];
    return displayedItems.filter((idea) => idea.status === "new");
  }, [activeTab, displayedItems]);

  const hasQueuedOrTriagingBatchIdeas = useMemo(() => {
    for (const state of batchTriageStates.values()) {
      if (state === "queued" || state === "triaging") return true;
    }
    return false;
  }, [batchTriageStates]);

  const batchTriageProgress = useMemo(() => {
    const total = batchTriageStates.size;
    if (total === 0) return null;
    let completed = 0;
    for (const state of batchTriageStates.values()) {
      if (state === "done" || state === "idle") {
        completed += 1;
      }
    }
    return { completed, total };
  }, [batchTriageStates]);

  const triagedReadyItems = useMemo(() => {
    if (activeTab !== "triaged") return [];
    return activeItems.filter((idea) => isReadyForSpecRoute(idea.triage_route));
  }, [activeItems, activeTab]);

  const triagedOtherItems = useMemo(() => {
    if (activeTab !== "triaged") return [];
    return activeItems.filter((idea) => !isReadyForSpecRoute(idea.triage_route));
  }, [activeItems, activeTab]);

  // Section counts (unfiltered for tab badges)
  const tabCounts = useMemo(() => ({
    inbox: ideas.filter((i) => (i.status === "new" || i.status === "triaging") && !completedBatchIdeaIds.has(i.id)).length,
    triaged: ideas.filter((i) => i.status === "triaged").length,
    developing: ideas.filter((i) => i.status === "developing" || i.status === "specced").length,
    workshop: ideas.filter((i) => i.status === "workshop").length,
    parked: ideas.filter((i) => i.status === "parked").length,
    rejected: ideas.filter((i) => i.status === "rejected").length,
    shipped: promotedIdeas.length,
    done: ideas.filter((i) => i.status === "done").length,
  }), [completedBatchIdeaIds, ideas, promotedIdeas]);

  // Type counts
  const typeCounts = useMemo(() => {
    const allIdeas = [...ideas, ...promotedIdeas];
    const c = { all: allIdeas.length, idea: 0, brief: 0, bug: 0, test: 0 };
    for (const i of allIdeas) {
      if (i.item_type in c) c[i.item_type as keyof typeof c]++;
    }
    return c;
  }, [ideas, promotedIdeas]);

  // Toggle expand
  function toggleExpand(id: string): void {
    setExpandedId((prev) => prev === id ? null : id);
  }

  // Handle idea action (triage/park/reject/promote) — show toast then remove
  function handleIdeaAction(ideaId: string, newStatus: string): void {
    const label = STATUS_LABELS[newStatus] ?? newStatus;
    if (newStatus !== "developing") {
      setIdeaSpecState(ideaId, "idle");
    }
    setDismissedIdeas((prev) => new Map(prev).set(ideaId, `Moved to ${label}`));
    setExpandedId(null);

    // After toast animation, actually update local state to move the idea
    setTimeout(() => {
      setDismissedIdeas((prev) => {
        const next = new Map(prev);
        next.delete(ideaId);
        return next;
      });
      setIdeas((prev) => prev.map((i) => i.id === ideaId ? { ...i, status: newStatus } : i));
    }, 3000);
  }

  // Batch triage all visible inbox ideas one at a time.
  async function handleBatchTriage(): Promise<void> {
    if (!activeCompanyId || hasQueuedOrTriagingBatchIdeas) return;
    const ideaIds = visibleInboxNewIdeas.map((idea) => idea.id);
    if (ideaIds.length === 0) return;

    const toErrorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
    const setIdeaBatchState = (ideaId: string, state: BatchTriageState): void => {
      setBatchTriageStates((prev) => {
        if (!prev.has(ideaId)) return prev;
        const next = new Map(prev);
        next.set(ideaId, state);
        return next;
      });
      if (state === "done") {
        markIdeaLeaving(ideaId, { allowAnyStatus: true });
      }
    };
    const setIdeaBatchError = (ideaId: string, message: string | null): void => {
      setBatchTriageErrors((prev) => {
        const hasExisting = prev.has(ideaId);
        if (!message && !hasExisting) return prev;
        const next = new Map(prev);
        if (message) {
          next.set(ideaId, message);
        } else {
          next.delete(ideaId);
        }
        return next;
      });
    };

    setBatchTriageErrors((prev) => {
      const next = new Map(prev);
      ideaIds.forEach((ideaId) => next.delete(ideaId));
      return next;
    });
    setBatchTriageStates(new Map(ideaIds.map((ideaId) => [ideaId, "queued" as BatchTriageState])));

    let succeeded = 0;
    let failed = 0;

    try {
      const projectsData = await fetchProjects(activeCompanyId);
      const projectId = projectsData[0]?.id ?? null;
      if (!projectId) {
        throw new Error("No project available for triage");
      }

      for (const ideaId of ideaIds) {
        setIdeaBatchState(ideaId, "triaging");

        try {
          await updateIdeaStatus(ideaId, "triaging");
          const triageResult = await requestHeadlessTriage({
            companyId: activeCompanyId,
            projectId,
            ideaIds: [ideaId],
          });

          if (!triageResult.ok) {
            throw new Error(triageResult.error || "Unknown error");
          }

          succeeded += 1;
          setIdeaBatchError(ideaId, null);
          setIdeaBatchState(ideaId, "done");
        } catch (ideaError) {
          failed += 1;
          await updateIdeaStatus(ideaId, "new").catch(() => {});
          setIdeaBatchError(ideaId, toErrorMessage(ideaError));
          setIdeaBatchState(ideaId, "idle");
        }
      }

      if (failed === 0) {
        showBatchToast({ tone: "success", message: `Triage complete: ${succeeded} sent` });
      } else {
        showBatchToast({ tone: "error", message: `${succeeded} of ${ideaIds.length} sent, ${failed} failed` }, 0);
      }
    } catch (err) {
      const message = toErrorMessage(err);
      setBatchTriageStates((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        ideaIds.forEach((ideaId) => {
          if (next.has(ideaId)) {
            next.set(ideaId, "idle");
          }
        });
        return next;
      });
      setBatchTriageErrors((prev) => {
        const next = new Map(prev);
        ideaIds.forEach((ideaId) => {
          if (!next.has(ideaId)) {
            next.set(ideaId, message);
          }
        });
        return next;
      });
      showBatchToast({ tone: "error", message: `Batch triage error: ${message}` }, 0);
    } finally {
      setBatchTriageStates((prev) => {
        if (prev.size === 0) return prev;
        const next = new Map(prev);
        for (const [ideaId, state] of prev.entries()) {
          if (state === "queued" || state === "triaging") {
            next.delete(ideaId);
          }
        }
        return next;
      });
    }
  }

  const handleRetrySpec = useCallback(async (ideaId: string): Promise<void> => {
    if (!activeCompanyId) return;

    setRetryingSpecIds((prev) => {
      if (prev.has(ideaId)) return prev;
      const next = new Set(prev);
      next.add(ideaId);
      return next;
    });
    setIdeaSpecState(ideaId, "speccing");

    try {
      const { data: ideaRow, error: ideaError } = await supabase
        .from("ideas")
        .select("id, status, project_id")
        .eq("id", ideaId)
        .maybeSingle();

      if (ideaError) {
        throw ideaError;
      }
      if (!ideaRow) {
        throw new Error("Idea no longer exists.");
      }

      let projectId = typeof ideaRow.project_id === "string" ? ideaRow.project_id : null;
      if (!projectId) {
        const projects = await fetchProjects(activeCompanyId);
        projectId = projects[0]?.id ?? null;
      }
      if (!projectId) {
        throw new Error("No project available for spec retry.");
      }

      if (ideaRow.status === "triaged") {
        const { data: claimedRows, error: claimError } = await supabase
          .from("ideas")
          .update({ status: "developing" })
          .eq("id", ideaId)
          .eq("status", "triaged")
          .select("id");

        if (claimError) {
          throw claimError;
        }

        if ((claimedRows?.length ?? 0) === 0) {
          throw new Error("Idea was already claimed by another process.");
        }
      } else if (ideaRow.status !== "developing") {
        throw new Error(`Idea is currently "${ideaRow.status}" and cannot be retried for spec.`);
      }

      await requestHeadlessSpec({
        companyId: activeCompanyId,
        projectId,
        ideaIds: [ideaId],
        batchId: crypto.randomUUID(),
      });

      setIdeas((prev) => prev.map((idea) => (
        idea.id === ideaId ? { ...idea, status: "developing" } : idea
      )));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setIdeaSpecState(ideaId, "timed_out");
      showBatchToast(
        { tone: "error", message: `Spec retry failed: ${message}` },
        0,
      );
    } finally {
      setRetryingSpecIds((prev) => {
        if (!prev.has(ideaId)) return prev;
        const next = new Set(prev);
        next.delete(ideaId);
        return next;
      });
    }
  }, [activeCompanyId, setIdeaSpecState, showBatchToast]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent): void {
      if (!activeItems.length) return;
      const idx = expandedId ? activeItems.findIndex((i) => i.id === expandedId) : -1;

      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const next = activeItems[Math.min(idx + 1, activeItems.length - 1)];
        if (next) {
          setExpandedId(next.id);
          setTimeout(() => {
            document.getElementById(`il-row-${next.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const prev = activeItems[Math.max(idx - 1, 0)];
        if (prev) {
          setExpandedId(prev.id);
          setTimeout(() => {
            document.getElementById(`il-row-${prev.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
          }, 50);
        }
      } else if (e.key === "Escape") {
        setExpandedId(null);
      }
    }

    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [activeItems, expandedId]);

  if (loading) {
    return (
      <main className="ideas-page">
        <div className="ideas-loading">Loading ideas...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="ideas-page">
        <div className="ideas-error">{error}</div>
      </main>
    );
  }

  const isShippedTab = activeTab === "shipped";
  const isTriagedTab = activeTab === "triaged";
  const activeTabLabel = TAB_LABELS[activeTab];
  const typeFilterSuffix = typeFilter !== "all" ? ` of type "${typeFilter}"` : "";

  function renderIdeaRows(
    items: Idea[],
    startIndex = 0,
    triageStates: Map<string, BatchTriageState> = batchTriageStates,
    triagedSubsection?: TriagedSubsection,
  ): JSX.Element[] {
    return items.map((idea, idx) => {
      const dismissMsg = dismissedIdeas.get(idea.id);
      if (dismissMsg) {
        return (
          <div key={idea.id} className="il-row-dismissed">
            <span className="il-dismissed-text">{dismissMsg}</span>
            <span className="il-dismissed-title">{idea.title ?? idea.raw_text}</span>
          </div>
        );
      }

      const type = idea.item_type ?? "idea";
      const colorVar = TYPE_COLOR_VAR[type] ?? "--col-ideas";
      const isExpanded = expandedId === idea.id;
      const isLeaving = leavingIdeas.has(idea.id);
      const batchState = triageStates.get(idea.id) ?? "idle";
      const batchError = batchTriageErrors.get(idea.id);
      const isQueued = batchState === "queued";
      const isBatchTriaging = batchState === "triaging";
      const isDispatching = isQueued || isBatchTriaging;
      const isTriaging = (idea.status === "triaging" || isBatchTriaging) && !isLeaving;
      const specState = batchSpecStates.get(idea.id) ?? "idle";
      const isQueuedForSpec = specState === "queued";
      const isBatchSpeccing = specState === "speccing";
      const isSpecTimedOut = specState === "timed_out";
      const isRetryingSpec = retryingSpecIds.has(idea.id);
      const isSpeccing = (
        isQueuedForSpec
        || isBatchSpeccing
        || (idea.status === "developing" && specState === "idle")
      ) && !isLeaving;
      const showBatchError = batchState === "idle" && typeof batchError === "string";
      const showTriagingChip = isBatchTriaging || isTriaging || isDispatching;
      const isSpecced = idea.status === "specced";
      const fInfo = isShippedTab && idea.promoted_to_id ? featureStatuses.get(idea.promoted_to_id) ?? null : null;

      return (
        <div
          key={idea.id}
          id={`il-row-${idea.id}`}
          className={`il-row${isExpanded ? " expanded" : ""}${isTriaging ? " triaging" : ""}${isQueued ? " il-row--queued" : ""}${isDispatching ? " il-row--dispatching" : ""}${isLeaving ? " il-row--leaving" : ""}`}
          style={{ animationDelay: `${Math.min((startIndex + idx) * 0.02, 0.3)}s` }}
        >
          <div className="il-row-summary" onClick={() => !isTriaging && !isQueued && !isLeaving && toggleExpand(idea.id)}>
            <div className="il-row-accent" style={{ background: `var(${colorVar})` }} />
            <div className="il-row-icon">{TYPE_ICON[type] ?? "\u{1F4A1}"}</div>
            <div className="il-row-body">
              <div className="il-row-title">{idea.title ?? idea.raw_text}</div>
              {showTriagingChip ? (
                <div className="il-row-analysing">
                  {isQueued ? "Queued for triage" : "Analysing... an agent is triaging this idea"}
                </div>
              ) : showBatchError ? (
                <div className="il-row-batch-error">{`Triage failed: ${batchError}`}</div>
              ) : isSpecTimedOut ? (
                <div className="il-row-batch-error">Spec timed out after 5 minutes. Retry to re-dispatch.</div>
              ) : (
                <div className="il-row-desc">
                  {idea.description ?? idea.raw_text}
                </div>
              )}
            </div>
            <div className="il-row-meta">
              {showTriagingChip ? (
                <span className="il-triaging-badge">
                  {!isQueued && <span className="il-chip-spinner" aria-hidden="true" />}
                  <span>{isQueued ? "queued" : "triaging"}</span>
                </span>
              ) : showBatchError ? (
                <span className="il-feature-status negative">triage failed</span>
              ) : isSpeccing ? (
                <span className="il-triaging-badge">
                  <span className="il-chip-spinner" aria-hidden="true" />
                  <span>SPECCING</span>
                </span>
              ) : isSpecTimedOut ? (
                <>
                  <span className="il-feature-status negative">spec timed out</span>
                  <button
                    type="button"
                    className="il-inline-retry"
                    disabled={isRetryingSpec}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleRetrySpec(idea.id);
                    }}
                  >
                    {isRetryingSpec ? "Retrying..." : "Retry"}
                  </button>
                </>
              ) : isSpecced ? (
                <span className="il-feature-status positive">specced</span>
              ) : isShippedTab && fInfo ? (
                <span className={featureStatusClass(fInfo.status)}>{featureStatusLabel(fInfo.status)}</span>
              ) : (
                <span className={priorityClass(idea.priority)}>{priorityLabel(idea.priority)}</span>
              )}
              <span className="il-source">{sourceLabel(idea)}</span>
              <span className="il-age">{ageLabel(isShippedTab && idea.promoted_at ? idea.promoted_at : idea.created_at)}</span>
            </div>
            <div className="il-chevron">{!isTriaging && !isQueued && !isLeaving && <span className="il-chevron-icon">{"\u25B6"}</span>}</div>
          </div>

          {isExpanded && (
            <InlineDetail
              ideaId={idea.id}
              colorVar={colorVar}
              isShipped={isShippedTab}
              triagedSubsection={triagedSubsection}
              onAction={handleIdeaAction}
              onSpecStateChange={setIdeaSpecState}
            />
          )}
        </div>
      );
    });
  }

  return (
    <main className="ideas-page">
      {/* Header */}
      <div className="il-header">
        <h1 className="il-title">Ideas</h1>
      </div>
      {staleCleanupToast && (
        <div className="il-info-toast" role="status" aria-live="polite">
          {staleCleanupToast}
        </div>
      )}

      {/* Section tabs */}
      <div className="il-tabs">
        {(["inbox", "triaged", "developing", "workshop", "parked", "rejected", "shipped", "done"] as SectionTab[]).map((tab) => (
          <button
            key={tab}
            className={`il-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => { setActiveTab(tab); setExpandedId(null); }}
            type="button"
          >
            {TAB_LABELS[tab]}
            <span className="il-tab-count">{tabCounts[tab]}</span>
          </button>
        ))}
        {tabCounts.done > 0 && (
          <button
            key="done"
            className={`il-tab${activeTab === "done" ? " active" : ""}`}
            onClick={() => { setActiveTab("done"); setExpandedId(null); }}
            type="button"
          >
            Done
            <span className="il-tab-count">{tabCounts.done}</span>
          </button>
        )}
      </div>

      {/* Type filter (secondary) */}
      <div className="il-type-filters">
        {(["all", "idea", "brief", "bug", "test"] as TypeFilter[]).map((t) => (
          <button
            key={t}
            className={`il-type-btn${typeFilter === t ? " active" : ""}`}
            onClick={() => setTypeFilter(t)}
            type="button"
          >
            {t === "all" ? "All" : `${t.charAt(0).toUpperCase() + t.slice(1)}s`}
            <span className="il-type-count">{typeCounts[t]}</span>
          </button>
        ))}
      </div>

      {/* Sort controls */}
      <div className="il-sort-bar">
        <span className="il-sort-label">Sort</span>
        {([["newest", "Newest first"], ["oldest", "Oldest first"], ["priority", "Priority"]] as [SortMode, string][]).map(([mode, label]) => (
          <button
            key={mode}
            className={`il-sort-btn${sortMode === mode ? " active" : ""}`}
            onClick={() => setSortMode(mode)}
            type="button"
          >
            {label}
            {sortMode === mode && (
              <span className="il-sort-arrow">{mode === "oldest" ? "\u2191" : "\u2193"}</span>
            )}
          </button>
        ))}
      </div>

      {/* Batch triage bar */}
      {activeTab === "inbox" && (visibleInboxNewIdeas.length > 0 || hasQueuedOrTriagingBatchIdeas) && (
        <div className="il-batch-bar">
          <button
            className="il-action-secondary il-action-triage"
            type="button"
            disabled={hasQueuedOrTriagingBatchIdeas}
            onClick={handleBatchTriage}
          >
            {hasQueuedOrTriagingBatchIdeas && batchTriageProgress ? (
              <>
                <span className="il-triage-spinner" aria-hidden="true" />
                <span>{`Triaging... ${batchTriageProgress.completed}/${batchTriageProgress.total}`}</span>
              </>
            ) : `Triage All (${visibleInboxNewIdeas.length})`}
          </button>
        </div>
      )}

      {batchToasts.length > 0 && (
        <div className="il-toast-stack" aria-live="polite">
          {batchToasts.map((toast) => (
            <div
              key={toast.id}
              className={`il-toast il-toast-${toast.tone}`}
              role={toast.tone === "error" ? "alert" : "status"}
            >
              <span className="il-toast-message">{toast.message}</span>
              <div className="il-toast-actions">
                {toast.actionLabel && toast.onAction && (
                  <button
                    type="button"
                    className="il-toast-action"
                    onClick={() => {
                      dismissBatchToast(toast.id);
                      toast.onAction?.();
                    }}
                  >
                    {toast.actionLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="il-toast-dismiss"
                  onClick={() => dismissBatchToast(toast.id)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* List */}
      <div className="il-list" ref={listRef}>
        {!isTriagedTab && displayedItems.length === 0 && (
          <div className="il-empty">No {activeTabLabel.toLowerCase()} ideas{typeFilterSuffix}.</div>
        )}
        {isTriagedTab ? (
          <>
            {triagedReadyItems.length > 0 && (
              <div className="il-triaged-subsection">
                <div className="il-triaged-subheader">Ready for Spec</div>
                {renderIdeaRows(triagedReadyItems, 0, batchTriageStates, "readyForSpec")}
              </div>
            )}
            {triagedOtherItems.length > 0 && (
              <div className="il-triaged-subsection">
                <div className="il-triaged-subheader">Needs Decision</div>
                {renderIdeaRows(triagedOtherItems, triagedReadyItems.length, batchTriageStates, "needsDecision")}
              </div>
            )}
          </>
        ) : renderIdeaRows(displayedItems, 0, batchTriageStates)}
      </div>
    </main>
  );
}
