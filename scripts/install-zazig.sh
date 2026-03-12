#!/usr/bin/env bash
#
# install-zazig.sh — Bootstrap zazig standalone binaries
#
# Downloads the latest zazig release from GitHub and installs to ~/.zazigv2/bin/.
# Unlinks any existing npm-linked zazig command.
#
# Usage: bash scripts/install-zazig.sh
#
# Requires: curl, gh (GitHub CLI, authenticated)

set -euo pipefail

REPO="zazig-team/zazigv2"
BIN_DIR="$HOME/.zazigv2/bin"
PREV_DIR="$BIN_DIR/previous"

echo "=== zazig standalone binary installer ==="
echo

# 1. Unlink existing npm-linked zazig
if command -v zazig &>/dev/null; then
  CURRENT=$(which zazig)
  if [[ "$CURRENT" == *"node_modules"* || "$CURRENT" == *".npm"* || "$CURRENT" == *"nvm"* ]]; then
    echo "Unlinking npm-linked zazig at $CURRENT..."
    npm unlink -g @zazig/cli 2>/dev/null || true
    echo "Unlinked."
  elif [[ "$CURRENT" == "$BIN_DIR/zazig" ]]; then
    echo "zazig already installed at $BIN_DIR — will upgrade."
  else
    echo "Warning: zazig found at $CURRENT (not npm-linked). Proceeding anyway."
  fi
else
  echo "No existing zazig command found."
fi
echo

# 2. Get latest release version
echo "Fetching latest release..."
VERSION=$(gh release view --repo "$REPO" --json tagName --jq '.tagName' 2>/dev/null)
if [[ -z "$VERSION" ]]; then
  echo "Error: Could not fetch latest release. Make sure 'gh' is installed and authenticated." >&2
  exit 1
fi
echo "Latest release: $VERSION"
echo

# 3. Create directories
mkdir -p "$BIN_DIR" "$PREV_DIR"

# 4. Back up existing binaries
for bin in zazig zazig-agent agent-mcp-server; do
  if [[ -f "$BIN_DIR/$bin" ]]; then
    cp "$BIN_DIR/$bin" "$PREV_DIR/$bin" 2>/dev/null || true
  fi
done

# 5. Download binaries
echo "Downloading binaries..."
gh release download "$VERSION" \
  --repo "$REPO" \
  --pattern "zazig-cli-darwin-arm64" \
  --dir "$BIN_DIR" \
  --clobber

gh release download "$VERSION" \
  --repo "$REPO" \
  --pattern "zazig-agent-darwin-arm64" \
  --dir "$BIN_DIR" \
  --clobber

gh release download "$VERSION" \
  --repo "$REPO" \
  --pattern "agent-mcp-server-darwin-arm64" \
  --dir "$BIN_DIR" \
  --clobber

# 6. Rename to final names and make executable
mv "$BIN_DIR/zazig-cli-darwin-arm64" "$BIN_DIR/zazig"
mv "$BIN_DIR/zazig-agent-darwin-arm64" "$BIN_DIR/zazig-agent"
mv "$BIN_DIR/agent-mcp-server-darwin-arm64" "$BIN_DIR/agent-mcp-server"
chmod +x "$BIN_DIR/zazig" "$BIN_DIR/zazig-agent" "$BIN_DIR/agent-mcp-server"

# 7. Write version file
echo "${VERSION#v}" > "$BIN_DIR/.version"

echo
echo "Installed zazig $VERSION to $BIN_DIR"
echo

# 8. Check PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "*** Add this to your shell profile (~/.zshrc or ~/.bashrc): ***"
  echo
  echo "  export PATH=\"\$HOME/.zazigv2/bin:\$PATH\""
  echo
  echo "Then reload your shell: source ~/.zshrc (or ~/.bashrc)"
else
  echo "PATH already includes $BIN_DIR"
fi

echo
echo "Done! Run 'zazig login' then 'zazig start'."
