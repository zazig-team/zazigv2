#!/bin/bash
# Pull latest from production after a zazig promote.
# The release bundle (packages/cli/releases/zazig.mjs) is self-contained —
# git pull is all that's needed. npm link only runs on first setup.
set -e

cd "$(dirname "$0")/.."

echo "Pulling latest..."
git stash --quiet 2>/dev/null || true
git pull origin production
git stash pop --quiet 2>/dev/null || true

# First-time setup: link the CLI binary if not already linked
if ! command -v zazig &>/dev/null; then
  echo "First-time setup: linking CLI..."
  cd packages/cli
  npm link
  cd ../..
fi

VERSION=$(node -e "console.log(require('./packages/cli/package.json').version)" 2>/dev/null || echo "unknown")
echo "Done. zazig v${VERSION} ready. Run 'zazig start' to use the new build."
