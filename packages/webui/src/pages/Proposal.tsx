import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { signInWithGoogle } from "../lib/auth";
import {
  fetchProposal,
  requestProposalAccess,
  type ViewProposalResponse,
  type ProposalFull,
  type ProposalGateData,
  type ProposalSection,
} from "../lib/queries";

// ─── Markdown renderer (reusable from Roadmap) ──────────────────────────

function renderMarkdown(src: string): string {
  const blocks: string[] = [];
  let html = src.replace(
    /```(\w*)\n([\s\S]*?)```/g,
    (_, _lang: string, code: string) => {
      blocks.push(
        `<pre class="proposal-pre"><code>${code
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")}</code></pre>`,
      );
      return `\x00${blocks.length - 1}\x00`;
    },
  );

  html = html.replace(
    /^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_, hdr: string, _sep: string, body: string) => {
      const ths = hdr
        .split("|")
        .slice(1, -1)
        .map((h: string) => `<th>${h.trim()}</th>`)
        .join("");
      const rows = body
        .trim()
        .split("\n")
        .map((r: string) => {
          const tds = r
            .split("|")
            .slice(1, -1)
            .map((c: string) => `<td>${c.trim()}</td>`)
            .join("");
          return `<tr>${tds}</tr>`;
        })
        .join("");
      return `<table><thead><tr>${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    },
  );

  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");

  html = html.replace(/((?:^- .+$\n?)+)/gm, (m: string) => {
    const items = m
      .trim()
      .split("\n")
      .map((l: string) => `<li>${l.replace(/^- /, "")}</li>`)
      .join("");
    return `<ul>${items}</ul>`;
  });

  html = html.replace(/((?:^\d+\. .+$\n?)+)/gm, (m: string) => {
    const items = m
      .trim()
      .split("\n")
      .map((l: string) => `<li>${l.replace(/^\d+\.\s*/, "")}</li>`)
      .join("");
    return `<ol>${items}</ol>`;
  });

  html = html
    .split("\n\n")
    .map((block) => {
      const t = block.trim();
      if (!t || t.startsWith("<") || t.startsWith("\x00")) return t;
      return `<p>${t.replace(/\n/g, " ")}</p>`;
    })
    .join("\n");

  blocks.forEach((code, i) => {
    html = html.replace(`\x00${i}\x00`, code);
  });
  return html;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function sectionSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// ─── Sub-components ──────────────────────────────────────────────────────

function LoadingSkeleton(): JSX.Element {
  return (
    <div className="proposal-page proposal-loading">
      <div className="proposal-loading-shell">
        <div className="proposal-skel proposal-skel--logo" />
        <div className="proposal-skel proposal-skel--title" />
        <div className="proposal-skel proposal-skel--subtitle" />
        <div className="proposal-skel proposal-skel--btn" />
      </div>
    </div>
  );
}

function GatePage({
  gate,
  authenticated,
  authorized,
  expired,
  email,
  accentColor,
  onSignIn,
  onRequestAccess,
}: {
  gate: ProposalGateData;
  authenticated: boolean;
  authorized?: boolean;
  expired?: boolean;
  email?: string;
  accentColor: string;
  onSignIn: () => void;
  onRequestAccess: () => void;
}): JSX.Element {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  const handleRequestAccess = async (): Promise<void> => {
    setRequesting(true);
    try {
      await onRequestAccess();
      setRequested(true);
    } catch {
      // ignore
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="proposal-page proposal-gate">
      <div className="proposal-gate-noise" />
      <div
        className="proposal-gate-glow"
        style={{
          background: `radial-gradient(ellipse at center, ${accentColor}0a 0%, ${accentColor}04 30%, transparent 70%)`,
        }}
      />

      <div className="proposal-gate-shell">
        {/* Co-branded header */}
        <div className="proposal-gate-brands">
          <div className="proposal-gate-brand-zazig">
            <span className="proposal-gate-wordmark">zazig</span>
            <span className="proposal-gate-dot" />
          </div>
          <span className="proposal-gate-x">&times;</span>
          {gate.client_logo_url ? (
            <img
              src={gate.client_logo_url}
              alt={gate.client_name}
              className="proposal-gate-client-logo"
            />
          ) : (
            <span className="proposal-gate-client-name">
              {gate.client_name}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className="proposal-gate-title">
          A proposal prepared exclusively for
        </h1>
        <p className="proposal-gate-client" style={{ color: accentColor }}>
          {gate.client_name}
        </p>

        {/* Expired state */}
        {expired && (
          <div className="proposal-gate-expired">
            This proposal has expired. Please contact us for an updated version.
          </div>
        )}

        {/* Action area */}
        {!expired && (
          <div className="proposal-gate-actions">
            {!authenticated && (
              <button
                type="button"
                className="proposal-gate-google-btn"
                onClick={onSignIn}
              >
                <svg viewBox="0 0 18 18" fill="none" width="18" height="18">
                  <path
                    d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
                    fill="#4285F4"
                  />
                  <path
                    d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z"
                    fill="#34A853"
                  />
                  <path
                    d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 6.29C4.672 4.163 6.656 2.58 9 2.58z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google to view
              </button>
            )}

            {authenticated && authorized === false && (
              <div className="proposal-gate-unauthorized">
                <p className="proposal-gate-unauthorized-msg">
                  Signed in as <strong>{email}</strong>
                </p>
                {requested ? (
                  <p className="proposal-gate-requested">
                    Access requested. We will notify you when approved.
                  </p>
                ) : (
                  <button
                    type="button"
                    className="proposal-gate-request-btn"
                    style={{ background: accentColor }}
                    onClick={() => void handleRequestAccess()}
                    disabled={requesting}
                  >
                    {requesting ? (
                      <span className="proposal-spinner" />
                    ) : (
                      "Request Access"
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Meta */}
        <div className="proposal-gate-meta">
          <span>Prepared by {gate.prepared_by}</span>
          <span className="proposal-gate-meta-sep" />
          <span>{formatDate(gate.created_at)}</span>
        </div>
      </div>

      <footer className="proposal-gate-footer">
        &copy; Zazig &middot; zazig.com
      </footer>
    </div>
  );
}

function ProposalContent({
  proposal,
  accentColor,
}: {
  proposal: ProposalFull;
  accentColor: string;
}): JSX.Element {
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>("");

  const sortedSections = useMemo(
    () =>
      [...(proposal.content.sections ?? [])].sort(
        (a, b) => a.order - b.order,
      ),
    [proposal.content.sections],
  );

  useEffect(() => {
    const onScroll = (): void => {
      setScrolled(window.scrollY > 80);

      // Find active section
      let current = "";
      for (const section of sortedSections) {
        const el = document.getElementById(sectionSlug(section.title));
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) {
            current = sectionSlug(section.title);
          }
        }
      }
      setActiveSection(current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [sortedSections]);

  const scrollToSection = useCallback((slug: string) => {
    const el = document.getElementById(slug);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  const hasPricing =
    proposal.pricing &&
    proposal.pricing.phases &&
    proposal.pricing.phases.length > 0;

  return (
    <div className="proposal-page proposal-full">
      {/* Sticky header */}
      <header
        ref={headerRef}
        className={`proposal-header${scrolled ? " proposal-header--scrolled" : ""}`}
      >
        <div className="proposal-header-inner">
          <div className="proposal-header-brand">
            <span className="proposal-header-wordmark">zazig</span>
            <span className="proposal-header-dot" />
          </div>
          <span
            className={`proposal-header-title${scrolled ? " proposal-header-title--visible" : ""}`}
          >
            {proposal.title}
          </span>
        </div>
      </header>

      <div className="proposal-layout">
        {/* Sidebar nav */}
        <aside className="proposal-sidebar">
          <nav className="proposal-nav">
            <p className="proposal-nav-label">Contents</p>
            {sortedSections.map((section) => {
              const slug = sectionSlug(section.title);
              return (
                <button
                  key={section.key}
                  type="button"
                  className={`proposal-nav-item${activeSection === slug ? " proposal-nav-item--active" : ""}`}
                  style={
                    activeSection === slug
                      ? { color: accentColor, borderLeftColor: accentColor }
                      : undefined
                  }
                  onClick={() => scrollToSection(slug)}
                >
                  {section.title}
                </button>
              );
            })}
            {hasPricing && (
              <button
                type="button"
                className={`proposal-nav-item${activeSection === "pricing" ? " proposal-nav-item--active" : ""}`}
                style={
                  activeSection === "pricing"
                    ? { color: accentColor, borderLeftColor: accentColor }
                    : undefined
                }
                onClick={() => scrollToSection("pricing")}
              >
                Pricing
              </button>
            )}
            {proposal.valid_until && (
              <button
                type="button"
                className={`proposal-nav-item${activeSection === "timeline" ? " proposal-nav-item--active" : ""}`}
                style={
                  activeSection === "timeline"
                    ? { color: accentColor, borderLeftColor: accentColor }
                    : undefined
                }
                onClick={() => scrollToSection("timeline")}
              >
                Timeline
              </button>
            )}
          </nav>
        </aside>

        {/* Main content */}
        <main className="proposal-main">
          {/* Hero */}
          <div className="proposal-hero">
            <div className="proposal-hero-brands">
              <div className="proposal-hero-brand-zazig">
                <span className="proposal-hero-wordmark">zazig</span>
                <span className="proposal-hero-dot" />
              </div>
              <span className="proposal-hero-x">&times;</span>
              {proposal.client_logo_url ? (
                <img
                  src={proposal.client_logo_url}
                  alt={proposal.client_name}
                  className="proposal-hero-client-logo"
                />
              ) : (
                <span className="proposal-hero-client-name">
                  {proposal.client_name}
                </span>
              )}
            </div>
            <h1 className="proposal-hero-title">{proposal.title}</h1>
            <div className="proposal-hero-meta">
              <span>Prepared by {proposal.prepared_by}</span>
              <span className="proposal-hero-meta-sep" />
              <span>{formatDate(proposal.created_at)}</span>
              {proposal.valid_until && (
                <>
                  <span className="proposal-hero-meta-sep" />
                  <span>Valid until {formatDate(proposal.valid_until)}</span>
                </>
              )}
            </div>
          </div>

          {/* Sections */}
          {sortedSections.map((section: ProposalSection) => (
            <section
              key={section.key}
              id={sectionSlug(section.title)}
              className="proposal-section"
            >
              <h2
                className="proposal-section-title"
                style={{ borderBottomColor: `${accentColor}33` }}
              >
                {section.title}
              </h2>
              <div
                className="proposal-section-body"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(section.body_md),
                }}
              />
            </section>
          ))}

          {/* Pricing */}
          {hasPricing && (
            <section id="pricing" className="proposal-section">
              <h2
                className="proposal-section-title"
                style={{ borderBottomColor: `${accentColor}33` }}
              >
                Pricing
              </h2>

              <div className="proposal-pricing-grid">
                {proposal.pricing.phases.map((phase, i) => (
                  <div
                    key={i}
                    className="proposal-phase-card"
                    style={{ borderTopColor: accentColor }}
                  >
                    <div className="proposal-phase-name">{phase.name}</div>
                    <div className="proposal-phase-price">
                      {formatCurrency(phase.monthly)}
                      <span className="proposal-phase-price-period">
                        /month
                      </span>
                    </div>
                    <div className="proposal-phase-duration">
                      {phase.duration_months} month
                      {phase.duration_months !== 1 ? "s" : ""}
                    </div>
                    {phase.deliverables.length > 0 && (
                      <ul className="proposal-phase-deliverables">
                        {phase.deliverables.map((d, j) => (
                          <li key={j}>{d}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>

              {proposal.pricing.total_year1 > 0 && (
                <div className="proposal-pricing-total">
                  <span>Year 1 Total</span>
                  <span className="proposal-pricing-total-value">
                    {formatCurrency(proposal.pricing.total_year1)}
                  </span>
                </div>
              )}

              {proposal.pricing.loan_note_terms && (
                <div className="proposal-pricing-terms">
                  <h4>Loan Note Terms</h4>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: renderMarkdown(
                        proposal.pricing.loan_note_terms,
                      ),
                    }}
                  />
                </div>
              )}
            </section>
          )}

          {/* Timeline */}
          {hasPricing && (
            <section id="timeline" className="proposal-section">
              <h2
                className="proposal-section-title"
                style={{ borderBottomColor: `${accentColor}33` }}
              >
                Timeline
              </h2>
              <div className="proposal-timeline">
                {proposal.pricing.phases.map((phase, i) => {
                  const totalMonths = proposal.pricing.phases.reduce(
                    (sum, p) => sum + p.duration_months,
                    0,
                  );
                  const widthPct = (phase.duration_months / totalMonths) * 100;
                  return (
                    <div
                      key={i}
                      className="proposal-timeline-segment"
                      style={{
                        width: `${widthPct}%`,
                        background: `${accentColor}${i === 0 ? "22" : i === 1 ? "18" : "10"}`,
                        borderLeftColor:
                          i === 0 ? accentColor : "transparent",
                      }}
                    >
                      <div className="proposal-timeline-label">
                        {phase.name}
                      </div>
                      <div className="proposal-timeline-duration">
                        {phase.duration_months} mo
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Footer */}
          <footer className="proposal-footer">
            &copy; Zazig &middot;{" "}
            <a href="https://zazig.com" target="_blank" rel="noreferrer">
              zazig.com
            </a>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ─── Main Proposal page ─────────────────────────────────────────────────

export default function Proposal(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const { loading: authLoading, session } = useAuth();

  const [data, setData] = useState<ViewProposalResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!id) return;

    let cancelled = false;
    setLoading(true);

    fetchProposal(id)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to load proposal",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [id, authLoading, session]);

  const handleSignIn = useCallback(() => {
    sessionStorage.setItem(
      "auth_redirect",
      window.location.pathname + window.location.search,
    );
    void signInWithGoogle();
  }, []);

  const handleRequestAccess = useCallback(async () => {
    if (!id) return;
    await requestProposalAccess(id);
  }, [id]);

  // Derive accent color
  const accentColor = useMemo(() => {
    const brandColor =
      data?.proposal?.client_brand_color ?? data?.gate?.client_brand_color;
    return brandColor ?? "#00C853";
  }, [data]);

  // Loading state
  if (loading || authLoading) {
    return <LoadingSkeleton />;
  }

  // Error state
  if (error || !data) {
    return (
      <div className="proposal-page proposal-error">
        <div className="proposal-error-shell">
          <div className="proposal-error-icon">!</div>
          <h2>Proposal not found</h2>
          <p>{error ?? "This proposal does not exist or has been removed."}</p>
        </div>
      </div>
    );
  }

  // Authenticated + authorized -> full proposal
  if (data.authenticated && data.authorized && data.proposal) {
    return (
      <ProposalContent proposal={data.proposal} accentColor={accentColor} />
    );
  }

  // Gate page (unauthenticated or unauthorized)
  if (data.gate) {
    return (
      <GatePage
        gate={data.gate}
        authenticated={data.authenticated}
        authorized={data.authorized}
        expired={data.expired}
        email={data.email}
        accentColor={accentColor}
        onSignIn={handleSignIn}
        onRequestAccess={() => void handleRequestAccess()}
      />
    );
  }

  // Fallback error
  return (
    <div className="proposal-page proposal-error">
      <div className="proposal-error-shell">
        <div className="proposal-error-icon">!</div>
        <h2>Something went wrong</h2>
        <p>Unable to load this proposal. Please try again later.</p>
      </div>
    </div>
  );
}
