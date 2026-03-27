#!/bin/bash
set -euo pipefail

REPO_DIR="${ZAZIG_REPO_DIR:?ZAZIG_REPO_DIR not set}"
SKILLS_SRC="$REPO_DIR/.claude/skills"
SKILLS_DST="$HOME/.claude/skills"
LOG="/tmp/zazig-skill-sync.log"

log() { echo "$(date +%Y-%m-%dT%H:%M:%S) $1" >> "$LOG"; }

# Verify repo exists
if [ ! -d "$REPO_DIR/.git" ]; then
  log "ERROR: repo not found at $REPO_DIR"
  exit 1
fi

# Pull latest (silent, fail-safe)
cd "$REPO_DIR"
if ! git pull --ff-only origin master >> "$LOG" 2>&1; then
  log "SKIP: git pull failed (dirty tree or no network)"
  exit 0
fi

# Verify skills source exists
if [ ! -d "$SKILLS_SRC" ]; then
  log "SKIP: no .claude/skills/ directory in repo"
  exit 0
fi

# Ensure target directory exists
mkdir -p "$SKILLS_DST"

synced=0
skipped=0

# Symlink each skill
for skill_dir in "$SKILLS_SRC"/*/; do
  [ -d "$skill_dir" ] || continue
  name=$(basename "$skill_dir")
  target="$SKILLS_DST/$name"

  # Skip personal skills (real directories, not symlinks)
  if [ -d "$target" ] && [ ! -L "$target" ]; then
    log "SKIP: $name (personal skill, not a symlink)"
    skipped=$((skipped + 1))
    continue
  fi

  # Create or update symlink
  ln -sfn "$(cd "$skill_dir" && pwd)" "$target"
  synced=$((synced + 1))
done

log "OK: $synced skills synced, $skipped personal skills skipped"
