#!/usr/bin/env bash
#
# compile.sh — Compile .mjs bundles into standalone native binaries via Bun.
#
# Usage: ./compile.sh <output-dir> <repo-root>
#
# Requires: bun (brew install oven-sh/bun/bun)

set -euo pipefail

OUT_DIR="${1:?Usage: compile.sh <output-dir> <repo-root>}"
REPO_ROOT="${2:?Usage: compile.sh <output-dir> <repo-root>}"

if ! command -v bun &>/dev/null; then
  echo "Error: bun is not installed. Install with: brew install oven-sh/bun/bun" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Compiling zazig CLI..."
bun build --compile "$REPO_ROOT/packages/cli/releases/zazig.mjs" \
  --outfile "$OUT_DIR/zazig-cli-darwin-arm64"

echo "Compiling zazig-agent..."
bun build --compile "$REPO_ROOT/packages/local-agent/releases/zazig-agent.mjs" \
  --outfile "$OUT_DIR/zazig-agent-darwin-arm64"

echo "Compiling agent-mcp-server..."
bun build --compile "$REPO_ROOT/packages/local-agent/releases/agent-mcp-server.mjs" \
  --outfile "$OUT_DIR/agent-mcp-server-darwin-arm64"

echo "Compiled 3 binaries to $OUT_DIR"
ls -lh "$OUT_DIR"
