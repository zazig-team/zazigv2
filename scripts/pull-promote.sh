#!/bin/bash
# Pull latest from master and rebuild after a zazig promote
set -e

cd "$(dirname "$0")/.."

echo "Pulling latest..."
git pull origin master

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

echo "Linking CLI..."
cd packages/cli
npm link

echo "Done. Run 'zazig start' to use the new build."
