#!/bin/bash
# Pull latest from master after a zazig promote and link the pre-built CLI.
# No build step — zazig start runs from the bundled .mjs files committed at promote time.
# For staging (zazig-staging start), run npm run build separately.
set -e

cd "$(dirname "$0")/.."

echo "Pulling latest..."
git stash --quiet 2>/dev/null || true
git pull origin master
git stash pop --quiet 2>/dev/null || true

echo "Installing dependencies..."
npm install

echo "Linking CLI..."
cd packages/cli
npm link

echo "Done. Run 'zazig start' to use the new build."
