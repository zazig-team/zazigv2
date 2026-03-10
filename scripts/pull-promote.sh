#!/bin/bash
# Pull latest promoted production build and rebuild
set -e

cd "$(dirname "$0")/.."

echo "Pulling latest..."
git stash --quiet 2>/dev/null || true
git pull origin production
git stash pop --quiet 2>/dev/null || true

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Linking CLI..."
cd packages/cli
npm link

echo "Done. Run 'zazig start' to use the new build."
