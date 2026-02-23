/* ===================================================
   Zazig Org Model — Shared Navigation
   Injects sidebar into every page, highlights active
   =================================================== */

(function () {
  const pages = [
    { href: 'index.html', label: 'Overview', group: 'system' },
    { href: 'orchestrator.html', label: 'Orchestrator', group: 'layers' },
    { href: 'personalities.html', label: 'Personalities', group: 'layers' },
    { href: 'knowledge.html', label: 'Knowledge', group: 'layers' },
    { href: 'prompts.html', label: 'Role Prompts', group: 'layers' },
    { href: 'skills.html', label: 'Skills', group: 'layers' },
    { href: 'gateways.html', label: 'Gateways', group: 'layers' },
    { href: 'triggers.html', label: 'Triggers & Events', group: 'infra' },
    { href: 'charters.html', label: 'Charters', group: 'infra' },
    { href: 'status.html', label: 'Build Status', group: 'meta' },
    { href: 'open-questions.html', label: 'Open Questions', group: 'meta' },
  ];

  const groups = {
    system: 'System',
    layers: 'Layers',
    infra: 'Infrastructure',
    meta: 'Project',
  };

  // Determine active page
  const currentFile = window.location.pathname.split('/').pop() || 'index.html';

  // Build sidebar HTML
  const sidebar = document.createElement('nav');
  sidebar.className = 'sidebar';
  sidebar.id = 'sidebar';

  let html = `
    <div class="sidebar-logo">
      <a href="index.html">
        <span class="logo-icon"></span>
        Zazig Org Model
      </a>
    </div>
    <div class="sidebar-nav">
  `;

  let currentGroup = null;
  for (const page of pages) {
    if (page.group !== currentGroup) {
      currentGroup = page.group;
      html += `<span class="nav-label">${groups[currentGroup]}</span>`;
    }
    const isActive = currentFile === page.href ? ' class="active"' : '';
    html += `<a href="${page.href}"${isActive}>${page.label}</a>`;
  }

  html += '</div>';
  sidebar.innerHTML = html;

  // Build mobile toggle
  const toggle = document.createElement('button');
  toggle.className = 'menu-toggle';
  toggle.textContent = 'Menu';
  toggle.addEventListener('click', function () {
    sidebar.classList.toggle('open');
  });

  // Close sidebar on link click (mobile)
  sidebar.addEventListener('click', function (e) {
    if (e.target.tagName === 'A') {
      sidebar.classList.remove('open');
    }
  });

  // Inject into DOM
  document.body.prepend(sidebar);
  document.body.prepend(toggle);
})();
