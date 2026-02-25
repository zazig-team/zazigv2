// PHASE 1 INTEGRATION POINT: Set USE_MOCK_DATA to false once the ideas table
// migration (053_ideas_inbox.sql) and query-ideas edge function are deployed.
const USE_MOCK_DATA = true;

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://jmussmwglgbwncgygzbz.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptdXNzbXdnbGdid25jZ3lnemJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE0NTMyNDEsImV4cCI6MjA4NzAyOTI0MX0.bI2U8TNQ5FZ5ri3DUWJGZFuvC99WGc-fslmZZ5TcQo0';

export const sb = createClient(SUPABASE_URL, ANON_KEY);

// ── Mock dataset ──────────────────────────────────────────────────────────────
// PHASE 1 INTEGRATION POINT: Remove MOCK_IDEAS once real data is available.

const MOCK_IDEAS = [
  {
    id: 'mock-001',
    raw_text: 'We should probably add keyboard shortcuts to the pipeline dashboard — at least J/K for navigation and Enter to open card detail.',
    refined_summary: null,
    tags: ['ux', 'dashboard'],
    source: 'terminal',
    originator: 'human',
    status: 'new',
    priority: 'medium',
    suggested_scope: null,
    suggested_exec: null,
    complexity_estimate: null,
    triage_notes: null,
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-002',
    raw_text: 'Monitoring agent flagged that competitor "BuildFlow" just shipped an AI-powered sprint planning feature. Could be worth researching before our next roadmap session.',
    refined_summary: null,
    tags: ['competitor', 'research'],
    source: 'monitoring',
    originator: 'monitoring-agent',
    status: 'new',
    priority: 'high',
    suggested_scope: null,
    suggested_exec: null,
    complexity_estimate: null,
    triage_notes: null,
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-003',
    raw_text: 'The executor should stream progress updates in real-time rather than polling every 5s. Users get confused when the progress bar stalls.',
    refined_summary: null,
    tags: ['ux', 'performance', 'executor'],
    source: 'slack',
    originator: 'human',
    status: 'new',
    priority: 'medium',
    suggested_scope: null,
    suggested_exec: null,
    complexity_estimate: null,
    triage_notes: null,
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-004',
    raw_text: 'Add a "duplicate feature" action so CPO can clone an existing feature spec as a starting point for a similar new one.',
    refined_summary: 'Add "duplicate feature" action to pipeline dashboard',
    tags: ['dashboard', 'cpo'],
    source: 'terminal',
    originator: 'cpo',
    status: 'triaged',
    priority: 'low',
    suggested_scope: 'job',
    suggested_exec: 'cpo',
    complexity_estimate: 'small',
    triage_notes: 'Straightforward UI addition. Clone the feature row and open a rename dialog. Single job, no breakdown needed.',
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-005',
    raw_text: 'The job log viewer truncates at 50kb. For large verification jobs the bottom of the log gets cut off. Need to paginate or stream.',
    refined_summary: 'Paginate job log viewer to handle logs >50kb',
    tags: ['dashboard', 'ux', 'logs'],
    source: 'agent',
    originator: 'cto',
    status: 'triaged',
    priority: 'high',
    suggested_scope: 'feature',
    suggested_exec: 'cto',
    complexity_estimate: 'medium',
    triage_notes: 'CTO confirmed this is a real pain point. Needs backend pagination endpoint + frontend virtual scroll. Mid-sized feature, worth speccing properly.',
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-006',
    raw_text: 'Investigate whether we should replace the current polling architecture with Supabase Realtime subscriptions across the whole orchestrator. Could eliminate a lot of complexity.',
    refined_summary: 'Evaluate replacing polling with Supabase Realtime subscriptions in orchestrator',
    tags: ['architecture', 'infra', 'realtime'],
    source: 'terminal',
    originator: 'cto',
    status: 'triaged',
    priority: 'urgent',
    suggested_scope: 'research',
    suggested_exec: 'cto',
    complexity_estimate: 'large',
    triage_notes: 'Architectural decision with broad impact. Should be researched before committing to more polling-based features. Flag as urgent before the Q1 architecture review.',
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-007',
    raw_text: 'Add Telegram quick-capture: user sends /idea <text> to the bot and it creates an idea in the inbox instantly.',
    refined_summary: '/idea command for Telegram bot quick-capture',
    tags: ['telegram', 'capture'],
    source: 'telegram',
    originator: 'human',
    status: 'promoted',
    priority: 'medium',
    suggested_scope: 'feature',
    suggested_exec: 'cpo',
    complexity_estimate: 'small',
    triage_notes: 'Simple extension to the existing Telegram adapter.',
    promoted_to_type: 'feature',
    promoted_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    promoted_by: 'cpo',
    created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-008',
    raw_text: 'Build a native macOS menu bar app for Zazig so Tom can see job status without opening a browser.',
    refined_summary: 'Native macOS menu bar app for pipeline status',
    tags: ['macos', 'native', 'ux'],
    source: 'terminal',
    originator: 'human',
    status: 'parked',
    priority: 'low',
    suggested_scope: 'project',
    suggested_exec: 'cto',
    complexity_estimate: 'large',
    triage_notes: 'Cool idea but large scope with limited ROI given web dashboard already works well. Park until web experience is stable.',
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'mock-009',
    raw_text: 'Add dark/light theme toggle to the dashboard.',
    refined_summary: 'Dashboard theme toggle (dark/light)',
    tags: ['dashboard', 'ux'],
    source: 'web',
    originator: 'human',
    status: 'rejected',
    priority: 'low',
    suggested_scope: 'job',
    suggested_exec: 'cto',
    complexity_estimate: 'small',
    triage_notes: 'Dashboard is exclusively used by the founding team who prefer dark mode. Scope creep with no user demand. Rejected.',
    promoted_to_type: null,
    promoted_at: null,
    promoted_by: null,
    created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ── Auth ──────────────────────────────────────────────────────────────────────

export async function requireAuth() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) {
    // PHASE 1 INTEGRATION POINT: Update redirect to actual login page URL once created.
    window.location.href = '/?auth=required';
    throw new Error('Authentication required');
  }
  return session;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

export async function fetchIdeas(status = null) {
  // PHASE 1 INTEGRATION POINT: Remove this mock branch once the ideas table
  // migration (053_ideas_inbox.sql) and query-ideas edge function are deployed.
  if (USE_MOCK_DATA) {
    const data = (status && status !== 'all')
      ? MOCK_IDEAS.filter(i => i.status === status)
      : MOCK_IDEAS;
    return [...data]; // return a copy
  }

  // Real Supabase query — RLS limits results to the authenticated user's company.
  let query = sb.from('ideas').select('*').order('created_at', { ascending: false });
  if (status && status !== 'all') query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function truncate(str, len = 120) {
  const s = String(str ?? '').trim();
  return s.length > len ? s.slice(0, len - 1) + '…' : s;
}

function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function sourceIcon(source) {
  const icons = {
    terminal: '⌨',
    slack: '💬',
    telegram: '✈',
    agent: '🤖',
    web: '🌐',
    api: '🔌',
    monitoring: '👁',
  };
  return icons[source] ?? '💡';
}

function tagBadge(tag) {
  return `<span class="badge badge--tag">${escapeHtml(tag)}</span>`;
}

function scopeBadge(scope) {
  if (!scope) return '';
  return `<span class="badge badge--${escapeHtml(scope)}">${escapeHtml(scope)}</span>`;
}

function complexityBadge(complexity) {
  if (!complexity) return '';
  return `<span class="badge badge--${escapeHtml(complexity)}">${escapeHtml(complexity)}</span>`;
}

function execBadge(exec) {
  if (!exec) return '';
  return `<span class="badge badge--exec">${escapeHtml(exec)}</span>`;
}

// ── Card templates ────────────────────────────────────────────────────────────

function cardNew(idea) {
  const tags = Array.isArray(idea.tags) && idea.tags.length > 0
    ? `<div class="badge-row">${idea.tags.map(tagBadge).join('')}</div>`
    : '';

  return `
<div class="idea-card idea-card--new">
  <div class="card-meta">
    <span class="source-icon" title="${escapeHtml(idea.source)}">${sourceIcon(idea.source)}</span>
    <span class="originator">${escapeHtml(idea.originator)}</span>
    <span class="rel-time">${relativeTime(idea.created_at)}</span>
  </div>
  <p class="card-raw-text">${escapeHtml(truncate(idea.raw_text, 120))}</p>
  ${tags}
</div>`;
}

function cardTriaged(idea) {
  const title = idea.refined_summary || idea.raw_text;
  const priorityClass = `priority-${idea.priority ?? 'medium'}`;
  const badges = [
    scopeBadge(idea.suggested_scope),
    complexityBadge(idea.complexity_estimate),
    execBadge(idea.suggested_exec),
  ].filter(Boolean).join('');

  return `
<div class="idea-card idea-card--triaged ${escapeHtml(priorityClass)}">
  <div class="card-meta">
    <span class="originator">${escapeHtml(idea.originator)}</span>
    <span class="rel-time">${relativeTime(idea.created_at)}</span>
  </div>
  <h3 class="card-title">${escapeHtml(truncate(title, 80))}</h3>
  ${idea.triage_notes
    ? `<p class="card-desc">${escapeHtml(truncate(idea.triage_notes, 140))}</p>`
    : ''}
  ${badges ? `<div class="badge-row">${badges}</div>` : ''}
  <div id="actions-${escapeHtml(idea.id)}" class="card-actions"></div>
</div>`;
}

function cardPromoted(idea) {
  const title = idea.refined_summary || idea.raw_text || 'Untitled';

  return `
<div class="idea-card idea-card--promoted">
  <div class="card-meta">
    <span class="badge badge--promoted">→ ${escapeHtml(idea.promoted_to_type ?? 'promoted')}</span>
    <span class="rel-time">${relativeTime(idea.created_at)}</span>
  </div>
  <h3 class="card-title">${escapeHtml(truncate(title, 80))}</h3>
  <p class="promoted-meta">promoted ${formatDate(idea.promoted_at)} by ${escapeHtml(idea.promoted_by ?? '—')}</p>
</div>`;
}

function cardParked(idea) {
  const title = idea.refined_summary || idea.raw_text || 'Untitled';

  return `
<div class="idea-card idea-card--parked">
  <h3 class="card-title">${escapeHtml(truncate(title, 80))}</h3>
  ${idea.triage_notes
    ? `<p class="card-desc card-desc--muted">${escapeHtml(truncate(idea.triage_notes, 140))}</p>`
    : ''}
  <button class="resurface-btn" data-idea-id="${escapeHtml(idea.id)}">Resurface</button>
</div>`;
}

function cardRejected(idea) {
  const title = idea.refined_summary || idea.raw_text || 'Untitled';

  return `
<div class="idea-card idea-card--rejected">
  <h3 class="card-title card-title--struck">${escapeHtml(truncate(title, 80))}</h3>
  ${idea.triage_notes
    ? `<p class="card-desc card-desc--muted">${escapeHtml(truncate(idea.triage_notes, 140))}</p>`
    : ''}
</div>`;
}

function cardForIdea(idea) {
  switch (idea.status) {
    case 'new':      return cardNew(idea);
    case 'triaged':  return cardTriaged(idea);
    case 'promoted': return cardPromoted(idea);
    case 'parked':   return cardParked(idea);
    case 'rejected': return cardRejected(idea);
    default:         return cardNew(idea);
  }
}

// ── Count logic ───────────────────────────────────────────────────────────────

function updateCounts(allIdeas) {
  const counts = { all: allIdeas.length };
  ['new', 'triaged', 'promoted', 'parked', 'rejected'].forEach(s => {
    counts[s] = allIdeas.filter(i => i.status === s).length;
  });
  document.querySelectorAll('.tab .count').forEach(el => {
    const status = el.parentElement.dataset.status;
    el.textContent = counts[status] > 0 ? `(${counts[status]})` : '';
  });
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderIdeas(ideas, status) {
  const grid = document.getElementById('ideas-grid');
  const loading = document.getElementById('loading-state');
  const empty = document.getElementById('empty-state');

  loading.hidden = true;

  const filtered = (status && status !== 'all')
    ? ideas.filter(i => i.status === status)
    : ideas;

  if (filtered.length === 0) {
    grid.hidden = true;
    grid.innerHTML = '';
    empty.hidden = false;
    empty.textContent = status === 'all' ? 'No ideas yet.' : `No ${status} ideas.`;
    return;
  }

  empty.hidden = true;
  grid.hidden = false;
  grid.innerHTML = filtered.map(cardForIdea).join('');
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // PHASE 1 INTEGRATION POINT: Remove USE_MOCK_DATA condition below to enforce
  // auth on all requests once the ideas table and auth flow are live.
  if (!USE_MOCK_DATA) {
    try {
      await requireAuth();
    } catch (_) {
      return; // redirected to login
    }
  }

  // Show mock badge in development
  if (USE_MOCK_DATA) {
    const badge = document.getElementById('mock-indicator');
    if (badge) badge.hidden = false;
  }

  // Show loading
  document.getElementById('loading-state').hidden = false;

  let ideas = [];
  try {
    ideas = await fetchIdeas();
  } catch (err) {
    document.getElementById('loading-state').hidden = true;
    const errEl = document.getElementById('error-state');
    errEl.hidden = false;
    errEl.textContent = `Failed to load ideas: ${err.message}`;
    return;
  }

  updateCounts(ideas);
  renderIdeas(ideas, 'all');

  // Tab click handlers
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      renderIdeas(ideas, tab.dataset.status);
    });
  });
}

init();
