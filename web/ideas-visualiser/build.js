// build.js — ES module, Node.js 20+
// Runs from web/ideas-visualiser/ (set as Netlify base directory)
// docs/plans/ is at ../../docs/plans/ relative to this script's CWD

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { marked } from 'marked';

// ── Environment ───────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function injectEnv(html) {
  return html
    .replace(/window\.__SUPABASE_URL__/g, JSON.stringify(SUPABASE_URL))
    .replace(/window\.__SUPABASE_ANON_KEY__/g, JSON.stringify(SUPABASE_ANON_KEY));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[`*_[\]()#!@$%^&+=<>?|\\]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

function detectType(filename) {
  if (filename.includes('-proposal')) return 'proposal';
  if (filename.includes('-design')) return 'design';
  return 'general';
}

function typeClass(type) {
  const map = { proposal: 'doc-type-proposal', design: 'doc-type-design', general: 'doc-type-general' };
  return map[type] || 'doc-type-general';
}

function extractTitle(markdown) {
  for (const line of markdown.split('\n')) {
    const m = line.match(/^#\s+(.+)/);
    if (m) return m[1].trim();
  }
  return 'Untitled';
}

function extractDate(filename) {
  const m = basename(filename).match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function generateTOC(markdown) {
  const lines = markdown.split('\n');
  const items = [];

  for (const line of lines) {
    const m = line.match(/^(#{1,3})\s+(.+)/);
    if (!m) continue;
    const depth = m[1].length;
    // Strip inline markdown from heading text
    const rawText = m[2].trim().replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`(.+?)`/g, '$1');
    const id = slugify(rawText);
    items.push({ depth, text: rawText, id });
  }

  if (items.length === 0) return '<nav></nav>';

  const links = items.map(({ depth, text, id }) =>
    `<a href="#${id}" class="toc-h${depth}">${escapeHtml(text)}</a>`
  ).join('\n');

  return `<nav>\n${links}\n</nav>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Marked renderer ───────────────────────────────────────────────────────────

const renderer = new marked.Renderer();

// Headings: add id attributes for anchor links
// marked v12 uses positional args: heading(text, level, raw)
renderer.heading = function (text, level, raw) {
  const plainText = (raw || text)
    .trim()
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1');
  const id = slugify(plainText);
  return `<h${level} id="${id}">${text}</h${level}>\n`;
};

// Fenced code blocks: mermaid gets <pre class="mermaid">, rest get syntax class
// marked v12 uses positional args: code(code, infostring, escaped)
renderer.code = function (code, infostring) {
  const lang = (infostring || '').match(/^\S*/)?.[0] || '';
  if (lang === 'mermaid') {
    return `<pre class="mermaid">${escapeHtml(code)}</pre>\n`;
  }
  const langClass = lang ? ` class="language-${lang}"` : '';
  return `<pre><code${langClass}>${escapeHtml(code)}</code></pre>\n`;
};

marked.setOptions({ renderer });

// ── Paths ─────────────────────────────────────────────────────────────────────

const PLANS_DIR = '../../docs/plans';
const OUTPUT_DIR = 'docs';
const TEMPLATE_PATH = 'document.html';
const INDEX_PATH = join(OUTPUT_DIR, 'index.json');

// ── Ensure output directory exists ────────────────────────────────────────────

if (!existsSync(OUTPUT_DIR)) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ── Read document template (inject env vars) ──────────────────────────────────

const rawTemplate = readFileSync(TEMPLATE_PATH, 'utf8');
const template = injectEnv(rawTemplate);

// ── Process markdown files ────────────────────────────────────────────────────

let mdFiles = [];
try {
  mdFiles = readdirSync(PLANS_DIR).filter(f => extname(f) === '.md');
} catch (err) {
  console.warn(`[build] Could not read ${PLANS_DIR}:`, err.message);
}

const index = [];

for (const mdFile of mdFiles) {
  const mdPath = join(PLANS_DIR, mdFile);
  const markdown = readFileSync(mdPath, 'utf8');

  const name = basename(mdFile, '.md');
  const type = detectType(name);
  const date = extractDate(name);
  const title = extractTitle(markdown);
  const toc = generateTOC(markdown);
  const content = marked.parse(markdown);
  const docClass = typeClass(type);

  const html = template
    .replace(/{{TITLE}}/g, escapeHtml(title))
    .replace(/{{TOC}}/g, toc)
    .replace(/{{CONTENT}}/g, content)
    .replace(/{{DOC_TYPE_CLASS}}/g, docClass);

  const outFilename = name + '.html';
  writeFileSync(join(OUTPUT_DIR, outFilename), html);

  index.push({ filename: outFilename, title, date, type });
  console.log(`[build] → docs/${outFilename} (${type})`);
}

// Sort index by date descending
index.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2));
console.log(`[build] → docs/index.json (${index.length} documents)`);

// ── Inject env vars into static HTML pages ────────────────────────────────────

for (const file of ['auth.html', 'index.html']) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file, 'utf8');
  writeFileSync(file, injectEnv(content));
  console.log(`[build] → ${file} (env injected)`);
}

console.log('[build] Done.');
