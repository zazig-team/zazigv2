# CLI Binary Runs from Release Bundle, Not dist/

**Date:** 2026-03-05
**Tags:** CLI, esbuild, bundle, `releases/zazig.mjs`, `npm link`, "changes not taking effect", stale binary

## Problem

Code changes to `packages/cli/src/` were compiled to `dist/` via `npm run build` (tsc), but `zazig login` still ran old code. Changes appeared to have no effect.

## Context

The CLI `package.json` has:

```json
"bin": {
  "zazig": "./releases/zazig.mjs",
  "zazig-staging": "./dist/staging-index.js"
}
```

`zazig` points to `releases/zazig.mjs` — an **esbuild bundle** — not `dist/index.js`. The bundle is built by `packages/cli/scripts/bundle.js`, which reads from `dist/index.js` and bundles all dependencies into a single `.mjs` file.

`npm run build` only runs `tsc`, producing `dist/`. It does NOT rebuild the release bundle.

## Solution

After any CLI code change, run the full chain:

```bash
npm run build                           # tsc → dist/
cd packages/cli && node scripts/bundle.js  # esbuild → releases/zazig.mjs
npm link                                # symlink binary
```

## Decision Rationale

The release bundle exists for distribution — it's a single file with all deps inlined, no `node_modules` needed. `zazig-staging` points to `dist/` directly (no bundle), which is why staging CLI changes take effect without rebundling. This asymmetry is a gotcha.

## Prevention

- Add a `bundle` script to `package.json` and consider making it part of the build chain.
- When committing CLI changes, always commit the rebuilt `releases/zazig.mjs` too — it's a tracked file.
- If `zazig` changes don't take effect after rebuild, check `which zazig` and verify it points to the release bundle.
