-- Migration: 185_seed_live_beyond_proposal.sql
-- Seed the Live Beyond managed service proposal

INSERT INTO public.proposals (
    company_id,
    title,
    status,
    content,
    client_name,
    client_logo_url,
    client_brand_color,
    prepared_by,
    allowed_emails,
    pricing,
    valid_until
) VALUES (
    '00000000-0000-0000-0000-000000000001',
    'Zazig × Live Beyond — Managed Development Service',
    'draft',
    '{
        "sections": [
            {
                "key": "executive_summary",
                "title": "Executive Summary",
                "body_md": "Zazig offers Live Beyond a managed CPO + CTO development service, powered by AI-native engineering, to build the Duolingo-for-longevity platform.\n\n**Tom Weaver** serves as pseudo-CPO, bringing product strategy and a track record of building technology that processed 30 million orders per day. **Chris Evans** serves as pseudo-CTO, providing technical architecture and engineering leadership.\n\nZazig''s AI-native approach compresses traditional agency timelines and costs by 5–10×. All costs are fronted by Zazig and deferred into a loan note, repaid after Live Beyond raises funding — eliminating cash risk entirely.\n\nThe first milestone is a functional MVP live by **May 30, 2026** for LifeSummit Berlin, capturing 10–20% of your audience as users and providing investor-ready metrics.",
                "order": 1
            },
            {
                "key": "the_opportunity",
                "title": "The Opportunity",
                "body_md": "Live Beyond is building the world''s first gamified longevity platform — a Duolingo for living longer, better, and with more joy.\n\nThe foundation is extraordinary: 100+ scientist interviews, a feature documentary, a published book, and a network of world-class advisors. What''s needed now is the technology to capture the audience that these media assets will generate.\n\nThe May 30 LifeSummit Berlin event, combined with the Die Zeit article and Polish book launch, creates a time-sensitive window to convert hundreds of thousands of viewers into platform users. Every day without a live product is audience lost.\n\nMarek was quoted **$1.5M** by a traditional agency to build the full platform. Zazig delivers the same outcome at a fraction of the cost, starting immediately.",
                "order": 2
            },
            {
                "key": "phase_1",
                "title": "Phase 1 — MVP Sprint (Now → May 30)",
                "body_md": "A focused sprint to deliver everything needed for LifeSummit Berlin and investor conversations.\n\n### 1. Launch Website\n`livebeyond.world` — multi-language (EN, PL, DE), with dedicated pages for each expert featured in the movie and book. QR codes in the book and movie link directly to these pages. Waitlist capture and book presale links included.\n\n### 2. Longevity Map Experience\nThe core product: a gamified path through the 5 levels of the longevity game (Basics → Biohacking Upgrades → Radical Life Extension → Bridge of Prevention → Creating the New World). Web-based for instant access via QR code — no app store friction.\n\n### 3. Self-Diagnostic Onboarding\n\"Where are you on the longevity map?\" — a questionnaire that places users on the map and personalises their path. Captures valuable user data from day one.\n\n### 4. Initial iOS App\nNative app shipping the Longevity Map and diagnostic to the App Store. Ready for QR codes at LifeSummit Berlin. Users scan, download, and start their journey.\n\n### 5. Clickable Demo App\nA frontend-only prototype showing the full platform vision — habits, personalised guidance, content library, retreats, recommendations. This is what Marek walks investors through to show where the platform is going.\n\n### 6. Investor Deliverables\nOne-pager for the investor deck. Two-year cost projection. Tom and Chris listed on the team page with bios.",
                "order": 3
            },
            {
                "key": "phase_2",
                "title": "Phase 2 — Full Platform Build (June → Ongoing)",
                "body_md": "With the MVP live and user data flowing, Phase 2 builds out the complete platform.\n\n- **Longevity Calendar** — daily, weekly, and annual reminders generated from diagnostic data\n- **Habit Builder & Tracker** — 3 habits at a time, 20–30 day cycles, with smart tracking (photos, check-ins, wearable data)\n- **Content Library** — structured courses built from 300+ hours of expert interviews, with the bowhead whale brand hero\n- **Personalised Guidance** — progressive: wearables first, then blood biomarkers, then gene testing integration. Medical data stays on-device for compliance.\n- **Retreat System** — waitlist and booking for Live Beyond retreats worldwide, integrated with diagnostic data for pre-retreat preparation\n- **Recommendations Engine** — vetted affiliate partnerships for clinics, devices, supplements, wearables\n- **Android App** — extending reach beyond iOS\n- **Community Features** — multiplayer elements, leaderboards, ambassador programs\n- **Multi-Language Expansion** — Chinese, Portuguese, and beyond\n- **Analytics Dashboard** — for Marek''s team to track engagement, conversion, and retention",
                "order": 4
            },
            {
                "key": "team",
                "title": "The Team",
                "body_md": "### Tom Weaver — Chief Product Officer\nProduct strategist with deep experience in high-scale systems. Previously built technology processing 30 million orders per day. Brings product thinking, user experience design, and a bias for shipping.\n\n### Chris Evans — Chief Technology Officer\nTechnical architect and engineering leader. Responsible for platform architecture, infrastructure decisions, and technical quality.\n\n### The Zazig Platform\nZazig is an AI-native development platform. Instead of a team of 10–15 engineers, Zazig uses AI agents coordinated by Tom and Chris to deliver software at a fraction of the traditional cost and timeline.\n\nThis is not outsourcing. Tom and Chris are embedded in the project as pseudo co-founders, with full context on Live Beyond''s mission, content, and audience. The AI agents are their tools — like having a 50-person engineering team that works 24/7, directed by experienced leaders who care about the outcome.",
                "order": 5
            },
            {
                "key": "investment",
                "title": "Investment & Pricing",
                "body_md": "### Phase 1 — MVP Sprint\n**$5,000/month** for 3 months (March–May 2026)\nIncludes: all development, AI compute costs, infrastructure, deployment\n\n### Phase 2 — Full Platform\n**$3,500/month** ongoing from June 2026\nIncludes: continued development, maintenance, infrastructure, support\n\n### Year 1 Total: ~$45,000\n\nFor context, the traditional agency quote for this platform was **$1.5 million**.\n\n### Loan Note Structure\nAll costs are fronted by Zazig. The total accrued amount is deferred into a loan note, repaid after Live Beyond raises its Series A or equivalent funding round. This means:\n- **Zero cash outlay** for Live Beyond during the build phase\n- Zazig is invested in Live Beyond''s success — we only get paid when you succeed\n- The loan note aligns incentives: we build something investors want to fund",
                "order": 6
            },
            {
                "key": "timeline",
                "title": "Timeline",
                "body_md": "**March 2026** — Engagement begins. Architecture, design system, content strategy.\n\n**April 2026** — Launch website live. Longevity Map experience in development. iOS app in development.\n\n**May 30, 2026** — MVP launch at LifeSummit Berlin. Website, Longevity Map, diagnostic, iOS app, and clickable demo all live. Investor deliverables ready.\n\n**June–August 2026** — Phase 2 begins. Habit builder, content library, calendar. Closed screenings in Europe, Asia, US drive traffic.\n\n**September 2026** — Movie launch. Full platform MVP ready. Personalised guidance, retreats, recommendations.\n\n**October 2026+** — Scale. Android, advanced personalisation, community features, multi-language expansion.",
                "order": 7
            },
            {
                "key": "next_steps",
                "title": "Next Steps",
                "body_md": "1. **Review this proposal** — we''re available to walk through any section in detail\n2. **Confirm engagement** — a handshake is enough to start; formal loan note terms follow\n3. **Kick off** — we begin immediately with architecture and the launch website\n\nWe believe in Live Beyond''s mission. The longevity movement needs exactly this kind of platform — accessible, inspiring, evidence-based, and fun. We want to help build it.",
                "order": 8
            }
        ]
    }'::jsonb,
    'Live Beyond',
    NULL,
    NULL,
    'Tom Weaver',
    ARRAY['marek@longevityadvocate.com'],
    '{
        "phases": [
            {
                "name": "Phase 1 — MVP Sprint",
                "monthly": 5000,
                "duration_months": 3,
                "deliverables": [
                    "Launch website (multi-language, QR landings)",
                    "Longevity Map experience (gamified web app)",
                    "Self-diagnostic onboarding",
                    "Initial iOS app",
                    "Clickable demo app (investor prototype)",
                    "Investor deliverables (1-pager, cost projection)"
                ]
            },
            {
                "name": "Phase 2 — Full Platform Build",
                "monthly": 3500,
                "duration_months": 9,
                "deliverables": [
                    "Longevity Calendar",
                    "Habit builder & tracker",
                    "Content library",
                    "Personalised guidance",
                    "Retreat system",
                    "Recommendations engine",
                    "Android app",
                    "Community features",
                    "Multi-language expansion",
                    "Analytics dashboard"
                ]
            }
        ],
        "total_year1": 46500,
        "loan_note_terms": "Full amount deferred into loan note, repaid after Series A or equivalent funding raise"
    }'::jsonb,
    '2026-06-30T23:59:59Z'
);
