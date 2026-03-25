#!/bin/bash
set -euo pipefail

# Detect repo root from this script's location
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify this is the right repo
if [ ! -f "$REPO_DIR/CLAUDE.md" ]; then
  echo "ERROR: Can't find zazigv2 repo root. Run this script from inside the repo."
  exit 1
fi

PLIST_NAME="com.zazig.skill-sync"
PLIST_PATH="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"

echo "Installing skill-sync launchd agent..."
echo "  Repo: $REPO_DIR"
echo "  Plist: $PLIST_PATH"

# Ensure LaunchAgents directory exists
mkdir -p "$HOME/Library/LaunchAgents"

# Write plist
cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$PLIST_NAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$REPO_DIR/scripts/skill-sync.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>900</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/tmp/zazig-skill-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/zazig-skill-sync.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>$HOME</string>
        <key>ZAZIG_REPO_DIR</key>
        <string>$REPO_DIR</string>
    </dict>
</dict>
</plist>
EOF

# Load the agent (unload first if already running)
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"

# Run first sync immediately
echo "Running first sync..."
ZAZIG_REPO_DIR="$REPO_DIR" bash "$REPO_DIR/scripts/skill-sync.sh"

echo ""
echo "Done. Skills will sync every 15 minutes."
echo "Log: /tmp/zazig-skill-sync.log"
echo ""
echo "To uninstall:"
echo "  launchctl unload $PLIST_PATH"
echo "  rm $PLIST_PATH"
