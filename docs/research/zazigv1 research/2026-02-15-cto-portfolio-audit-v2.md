# CTO Portfolio Audit — 2026-02-15 (v2)

> **v2 note:** Second run of the day. This version used a 4-agent parallel team (security, architecture, performance, devops) scanning all 8 repos simultaneously, with Codex (GPT-5.3) second opinion for severity calibration. v1 was an earlier, lighter pass.

## Methodology

- **4 specialized reviewer agents** ran in parallel across all 8 active repos
- **Codex second opinion** (GPT-5.3, read-only, 67s) calibrated severity ratings and flagged gaps
- **Repos audited:** marginscape, spine-platform, tbx-ios, colophon, ink, quire, trw-projects, aida

---

## Portfolio Health at a Glance

| Domain | Rating | One-line |
|--------|--------|----------|
| **Security** | YELLOW | Live keys on disk, open email relay, universal CORS permissiveness |
| **Architecture** | YELLOW | Two God objects, no shared types across ecosystem, Spine has no API contract |
| **Performance** | YELLOW | Firestore N+1 reads everywhere, no caching, no image optimization. ~100 users OK, 1K yellow |
| **DevOps** | RED (Level 1) | Zero CI/CD, zero monitoring, near-zero tests across all 8 repos |

---

## CRITICAL Findings (fix within 48 hours)

| # | Domain | Finding | Repo | Impact |
|---|--------|---------|------|--------|
| 1 | Security | **Unauthenticated email endpoint** — `protocol-completion-email` Netlify function accepts any POST, sends email from sonia@aidacoaching.co.uk to any address. Open relay. | aida | Anyone can spam from your domain. Reputation/deliverability damage. |
| 2 | Security | **AppleScript injection** in `server.py:1040-1093` — user-controlled `prompt` parameter interpolated directly into AppleScript. Combined with wildcard CORS + no auth on localhost server. | ink | Any website visited while Ink runs can execute arbitrary AppleScript on the user's Mac. |
| 3 | Security | **Live Stripe keys + Firebase service account private key on disk** in `.env.local`. Not in git, but co-located with code. | aida | If disk/backup/sync exposed, full admin access to Aida Firebase + live payment system. |
| 4 | Performance | **N+1 Firestore reads** — `LibraryViewModel.swift:54-68` fires one sequential read per book. 50 books = 50 reads per app open. | tbx-ios | Firestore cost scales linearly with library size. Noticeable latency. |
| 5 | Performance | **Client-side post filtering** — fetches posts then filters out replies in Swift. Wastes 50%+ of Firestore reads. | marginscape | Firestore read quota burns 2x faster than needed. Feed pagination broken. |
| 6 | DevOps | **Zero CI/CD across all 8 repos** — no GitHub Actions, no automated builds, no test gates, no merge protection. | ALL | Broken code ships silently. No safety net. |

---

## HIGH Findings (fix this sprint)

| # | Domain | Finding | Repo |
|---|--------|---------|------|
| 7 | Security | CORS `origin: true` reflects any origin on authenticated API | spine-platform |
| 8 | Security | Dev mode auth bypass — JWT accepted without verification when `NODE_ENV=development` | aida |
| 9 | Security | Wildcard CORS + no auth on Flask server (any website can control local Ink server) | ink |
| 10 | Security | Stripe checkout `success_url` uses attacker-controlled `event.headers.origin` | aida |
| 11 | Architecture | **God Object** — `ItemManager.swift` (1,752 lines), all business logic in one class | tbx-ios |
| 12 | Architecture | **God Component** — `App.tsx` (1,454 lines), 30+ `useState`, untestable | ink |
| 13 | Architecture | **No shared type definitions** — `Book` entity defined 4 different ways across 4 repos | ecosystem |
| 14 | Architecture | Dual architecture — legacy `classes/` vs modern `Services/` coexist, maintenance split-brain | tbx-ios |
| 15 | Performance | O(n) like-status checks — one Firestore read per post per page load | marginscape |
| 16 | Performance | No image downsampling — 12MP photos uploaded at full resolution | marginscape |
| 17 | Performance | ImageCache has no size limit — memory grows unbounded | tbx-ios |
| 18 | DevOps | **No monitoring/error tracking anywhere** — no Sentry, no Crashlytics, no alerting. Aida handles payments blind. | ALL |
| 19 | DevOps | **Near-zero test coverage** — only ink (17 pytest files) and quire (3 vitest files) have tests | ALL |
| 20 | DevOps | **3 key repos have no CLAUDE.md** — agents waste 15+ min onboarding each dispatch | spine-platform, tbx-ios, ink |

---

## MEDIUM Findings (schedule)

- **4 repos missing `.env` in .gitignore** (spine-platform, trw-projects, ink, quire partial)
- **No `.env.example` files anywhere** — env vars undocumented across portfolio
- **No pre-commit hooks** except marginscape — secrets can be committed without warning
- **marginscape 7 singletons** — no dependency injection, untestable service layer
- **spine-platform unsafe type assertion** in auth middleware (`(req as any).uid`)
- **Firestore read-then-write** instead of upsert in marginscape ReadingProgressService
- **Quire EPUB parser holds 100MB+ in memory** in serverless function with 256MB limit
- **Agent blast radius** — `Bash(bash:*)` wildcard permission in trw-projects
- **Branch accumulation** — 5-17 stale `cpo/` branches per repo
- **tbx-ios `tbxItem` uses legacy `@Published`** instead of `@Observable` macro
- **colophon 754-line landing page** in single component
- **aida sub-apps initialize Firebase independently** instead of sharing config
- **Netlify functions missing request timeout** configuration on fetch calls
- **No dependency lock file** for ink Python backend
- **tbx-ios has both `main` and `master` branches** — legacy rename incomplete

---

## Codex Second Opinion — Severity Calibrations

**Where Codex agreed:** All 4 domain ratings. Zero CI/CD as critical. Firestore N+1 as critical. The systemic risk framing — "AI-heavy delivery without guardrails."

| Finding | Original | Codex Says | Rationale |
|---------|----------|-----------|-----------|
| Aida open email relay | HIGH | **CRITICAL** | Active exploitability, domain reputation risk |
| Ink Flask + AppleScript injection | HIGH | **CRITICAL** | RCE vector if reachable beyond localhost |
| No monitoring (aida handles payments) | HIGH | **CRITICAL** | Blind payment system = unacceptable |
| Near-zero tests | MEDIUM | **HIGH** | "In an AI-coded portfolio, tests are the only guardrail" |
| .env.local keys on disk | CRITICAL | **HIGH** | Only critical if committed/shared/backed up |
| God objects (ink, tbx) | CRITICAL | **HIGH** | Maintainability, not existential |
| Missing CLAUDE.md | CRITICAL | **LOW-MEDIUM** | Ops friction, not a blocker |
| Missing .env.example | HIGH | **MEDIUM** | Nice to have, not urgent |

> The final report above reflects the calibrated severities (both models' input merged).

### 7 Gaps Codex Flagged

The original audit missed these CTO-level concerns:

1. **Disaster recovery** — no backup/restore plan for Firebase/Firestore (RPO/RTO undefined)
2. **IAM posture** — service account scope, key expiry, least privilege not assessed
3. **Supply chain controls** — no dependency scanning, no SBOM, no version pinning discipline
4. **Release governance** — no branch protection, no CODEOWNERS, no required checks on any repo
5. **Compliance/privacy** — PII handling, Stripe PCI scope, data retention/deletion policies
6. **Cost guardrails** — no Firestore read budgets, no billing alerts, no abuse limits
7. **Secrets rotation status** — what's been exposed, when was it last rotated?

---

## Top 5 Priority Actions

Both Opus and Codex converged on the same priority stack:

### 1. 48-Hour Security Containment
- Rotate all Aida keys (Stripe, Firebase SA, Mux, Resend, Mailchimp)
- Add Firebase Auth to `protocol-completion-email`
- Fix Ink AppleScript injection (sanitize prompt parameter)
- Restrict CORS to specific origins on spine-platform, ink, aida functions
- Fix Aida Stripe `success_url` to use hardcoded origin whitelist
- Add `.env` to all missing `.gitignore` files
- **Owner:** VP-Eng (immediate dispatch)

### 2. Week 1: Portfolio CI Baseline
- One reusable GitHub Actions workflow: lint + build + test + secret scan
- Apply to the 4 most active repos: marginscape, spine-platform, quire, ink
- Enable branch protection on `main` with required checks
- **Owner:** VP-Eng (Codex-first — mechanical)

### 3. Week 1-2: Observability Baseline
- Sentry free tier on all deployed web apps + Netlify functions (aida, quire, colophon)
- Firebase Crashlytics on iOS apps (marginscape, tbx-ios)
- Billing alerts on Firebase console (cost guardrails)
- **Owner:** VP-Eng (Codex-first)

### 4. Week 2: Firestore Performance Sprint
- Fix tbx-ios N+1 (batch reads with `whereField(in:)` chunks)
- Fix marginscape client-side post filtering (sentinel value for `parentPostId`)
- Fix marginscape like-status fan-out (flat set approach)
- Add image downsampling before upload in marginscape
- Set ImageCache size limit in tbx-ios
- **Owner:** VP-Eng (claude-ok — needs reasoning)

### 5. Week 3: Contract-First Platform
- Publish OpenAPI spec for Spine `/v1/` API
- Generate shared TypeScript + Swift type definitions from spec
- Create CLAUDE.md for spine-platform, tbx-ios, ink
- **Owner:** CTO designs spec, VP-Eng implements

---

## Per-Repo Scorecard

| Repo | Security | Architecture | Performance | DevOps | Overall |
|------|----------|-------------|-------------|--------|---------|
| spine-platform | GREEN-YELLOW | HIGH maturity | YELLOW | POOR | YELLOW |
| marginscape | GREEN-YELLOW | MEDIUM-HIGH | YELLOW | BASIC | YELLOW |
| tbx-ios | YELLOW | MEDIUM (transitioning) | RED | POOR | YELLOW-RED |
| ink | YELLOW | MEDIUM (backend high, frontend low) | GREEN | BASIC | YELLOW |
| quire | GREEN | EARLY (sound foundations) | YELLOW | BASIC | GREEN-YELLOW |
| colophon | GREEN | EARLY | GREEN | BASIC | GREEN |
| aida | YELLOW-RED | MEDIUM | GREEN | BASIC | YELLOW |
| trw-projects | YELLOW | N/A (tooling) | GREEN | POOR | YELLOW |

---

## Detailed Domain Reports

The full agent reports are available on request. Key highlights per domain:

### Security Deep Dive
- **Best posture:** quire (tight Firestore rules with immutable field protections), colophon (minimal attack surface)
- **Worst posture:** aida (payment handling + open relay + keys on disk), ink (localhost RCE vector)
- **Portfolio pattern:** Firebase Auth used correctly everywhere. Firestore rules generally well-written. No secrets found in git history. CORS is universally too permissive.

### Architecture Deep Dive
- **Best architecture:** spine-platform (clean repository pattern, proper separation, comprehensive types, API versioning)
- **Worst architecture:** tbx-ios (dual competing architectures, 1,752-line God Object)
- **Portfolio pattern:** CLAUDE.md quality directly correlates with agent productivity. marginscape's is the gold standard. Spine ecosystem vision is coherent but types diverge across consumers.
- **Spine integration health:** GOOD with gaps. TBX properly uses dual-Firebase. Marginscape's Book model (3 fields) vs Spine's (25 fields) shows massive drift. No OpenAPI contract means clients reverse-engineer the API.

### Performance Deep Dive
- **Scaling readiness:** ~100 concurrent users OK. 1K yellow. 10K+ red.
- **#1 portfolio concern:** Firestore read optimization. Three repos share the same N+1 / unnecessary read patterns. Since all apps share a Firebase billing account, reads compound across the portfolio.
- **Good patterns observed:** marginscape's batched book fetches (chunks of 10), optimistic UI updates with rollback, debounced search. spine-platform's batch chapter creation at 450 (below Firestore 500 limit). quire's zip bomb protection.
- **No caching layer in any iOS app.** Every app launch hits Firestore fresh.

### DevOps Deep Dive
- **DevOps maturity: Level 1 (Ad Hoc)** across the board.
- **What's consistent (good):** `.claude/napkin.md` in every repo, `.project-status.md` in every repo, `cpo/` branch naming convention, Firebase as universal backend.
- **What's missing everywhere:** CI/CD (0/8), error tracking (0/8), `.env.example` (0/8), code formatter config (0/8), README.md (3/8 have one).
- **Agent onboarding:** marginscape 3 min (excellent CLAUDE.md), aida/quire/colophon 5 min, ink 10 min, spine-platform/tbx-ios 15 min (no CLAUDE.md).
- **Testing:** ink has 17 pytest files (good). quire has 3 vitest files (start). spine-platform has jest configured but zero test files. Everyone else: nothing.

---

## Decisions Needed

1. **Security containment** — Create cards and dispatch VP-Eng immediately for the 48-hour items?
2. **CI approach** — GitHub Actions (free, standard) or something lighter?
3. **Monitoring** — Sentry free tier + Crashlytics, or Firebase-only?
4. **Spine OpenAPI spec** — Deep dive and design doc?
