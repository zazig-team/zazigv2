#!/bin/bash
# =============================================================================
# Mac Mini Bootstrap — Full dev machine + pipeline runner
# Run via SSH after Tailscale is set up on the Mac Mini.
#
# Prerequisites (done manually on the Mac Mini):
#   1. Create user account, connect to network
#   2. System Settings → General → Sharing → Remote Login (SSH)
#   3. Install Tailscale from https://tailscale.com/download/mac
#   4. Accept Xcode license: sudo xcodebuild -license accept
#
# Usage: ssh tomweaver@<tailscale-ip> 'bash -s' < scripts/bootstrap-mac-mini.sh
# =============================================================================
set -e

echo "============================================"
echo "Mac Mini Bootstrap — Starting"
echo "============================================"

# -----------------------------------------------------------------------------
# 1. Xcode Command Line Tools
# -----------------------------------------------------------------------------
if ! xcode-select -p &>/dev/null; then
  echo "Installing Xcode Command Line Tools..."
  xcode-select --install
  echo "Waiting for Xcode CLT install to complete..."
  echo "Press ENTER when done."
  read -r
else
  echo "✓ Xcode CLT already installed"
fi

# -----------------------------------------------------------------------------
# 2. Homebrew
# -----------------------------------------------------------------------------
if ! command -v brew &>/dev/null; then
  echo "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  eval "$(/opt/homebrew/bin/brew shellenv)"
else
  echo "✓ Homebrew already installed"
fi

# Add brew to current session
eval "$(/opt/homebrew/bin/brew shellenv)"

# -----------------------------------------------------------------------------
# 3. Core CLI tools (formulae)
# -----------------------------------------------------------------------------
echo "Installing Homebrew formulae..."
brew install \
  git \
  gh \
  tmux \
  deno \
  doppler \
  supabase \
  ripgrep \
  gnupg \
  eza \
  bat \
  fd \
  fzf \
  zoxide \
  starship \
  lazygit \
  btop \
  jq

# -----------------------------------------------------------------------------
# 4. Casks
# -----------------------------------------------------------------------------
echo "Installing Homebrew casks..."
brew install --cask \
  codex

# -----------------------------------------------------------------------------
# 5. fnm + Node
# -----------------------------------------------------------------------------
if ! command -v fnm &>/dev/null; then
  echo "Installing fnm..."
  curl -fsSL https://fnm.vercel.app/install | bash
fi

export PATH="$HOME/.local/share/fnm:$PATH"
eval "$(fnm env)"

echo "Installing Node v22..."
fnm install 22
fnm default 22
fnm use 22

# -----------------------------------------------------------------------------
# 6. Global npm packages
# -----------------------------------------------------------------------------
echo "Installing global npm packages..."
npm install -g @anthropic-ai/claude-code

# -----------------------------------------------------------------------------
# 7. Gemini CLI
# -----------------------------------------------------------------------------
if ! command -v gemini &>/dev/null; then
  echo "Installing Gemini CLI..."
  npm install -g @anthropic-ai/gemini-cli 2>/dev/null || echo "Gemini CLI — install manually if needed"
fi

# -----------------------------------------------------------------------------
# 8. SSH key
# -----------------------------------------------------------------------------
if [ ! -f ~/.ssh/id_ed25519 ]; then
  echo "Generating SSH key..."
  ssh-keygen -t ed25519 -C "tom@zazig.com" -f ~/.ssh/id_ed25519 -N ""
  echo ""
  echo "Add this public key to GitHub:"
  cat ~/.ssh/id_ed25519.pub
  echo ""
  echo "Press ENTER after adding to GitHub."
  read -r
else
  echo "✓ SSH key already exists"
fi

# -----------------------------------------------------------------------------
# 9. GitHub CLI auth
# -----------------------------------------------------------------------------
if ! gh auth status &>/dev/null; then
  echo "Authenticating GitHub CLI..."
  gh auth login
else
  echo "✓ GitHub CLI already authenticated"
fi

# -----------------------------------------------------------------------------
# 10. Clone zazigv2
# -----------------------------------------------------------------------------
mkdir -p ~/Documents/GitHub
if [ ! -d ~/Documents/GitHub/zazigv2 ]; then
  echo "Cloning zazigv2..."
  cd ~/Documents/GitHub
  gh repo clone zazig-team/zazigv2
else
  echo "✓ zazigv2 already cloned"
fi

# -----------------------------------------------------------------------------
# 11. Build zazigv2 + link CLI
# -----------------------------------------------------------------------------
echo "Building zazigv2..."
cd ~/Documents/GitHub/zazigv2
npm install
npm run build
cd packages/cli
npm link

# -----------------------------------------------------------------------------
# 12. Doppler login
# -----------------------------------------------------------------------------
if ! doppler whoami &>/dev/null 2>&1; then
  echo "Logging into Doppler..."
  doppler login
else
  echo "✓ Doppler already authenticated"
fi

# -----------------------------------------------------------------------------
# 13. zazig config
# -----------------------------------------------------------------------------
mkdir -p ~/.zazigv2
if [ ! -f ~/.zazigv2/config.json ]; then
  echo "Creating zazig config..."
  cat > ~/.zazigv2/config.json << 'ZCONF'
{
  "name": "toms-mac-mini",
  "slots": {
    "claude_code": 8,
    "codex": 4
  }
}
ZCONF
  echo "✓ zazig config created (8 claude + 4 codex slots — adjust as needed)"
else
  echo "✓ zazig config already exists"
fi

# -----------------------------------------------------------------------------
# 14. Shell config (.zshrc)
# -----------------------------------------------------------------------------
echo "Writing .zshrc..."
cat > ~/.zshrc << 'ZSHRC'
# =============================================================================
# Mac Mini ZSHRC
# =============================================================================

export PATH="$HOME/.local/bin:$HOME/.zazig/bin:$HOME/Documents/GitHub/zazig/tools:$PATH"

# fnm
eval "$(fnm env --use-on-cd)"

# Modern CLI integrations
eval "$(zoxide init zsh)"
source <(fzf --zsh)
eval "$(starship init zsh)"

# Aliases — modern replacements
alias ls='eza --icons --group-directories-first'
alias ll='eza -la --icons --group-directories-first'
alias la='eza -a --icons --group-directories-first'
alias lt='eza --tree --level=2 --icons'
alias cat='bat --paging=never'
alias find='fd'
alias top='btop'
alias lg='lazygit'

# Git shortcuts
alias g='git'
alias gs='git status'
alias gd='git diff'
alias ga='git add'
alias gc='git commit'
alias gp='git push'
alias gl='git pull'
alias gco='git checkout'
alias gb='git branch'

# Navigation
alias ..='cd ..'
alias ...='cd ../..'
alias c='clear'
alias reload='source ~/.zshrc'

# Safety
alias rm='rm -i'
alias mv='mv -i'
alias cp='cp -i'

# Environment
export EDITOR='vim'
export VISUAL='vim'
export FZF_DEFAULT_COMMAND='fd --type f --hidden --follow --exclude .git'
export FZF_DEFAULT_OPTS='--height 40% --layout=reverse --border'
export BAT_THEME="Dracula"

# Doppler → env
export OPENAI_API_KEY=$(doppler secrets get OPENAI_API_KEY --project zazig --config prd --plain 2>/dev/null)

# SSH + tmux auto-attach
if [[ -n "$SSH_CONNECTION" && -z "$TMUX" ]]; then
  tmux attach -t main 2>/dev/null || tmux new -s main
fi

# Unlock keychain for Claude Code over SSH
claude() {
  if [ -n "$SSH_CONNECTION" ] && [ -z "$KEYCHAIN_UNLOCKED" ]; then
    security unlock-keychain ~/Library/Keychains/login.keychain-db
    export KEYCHAIN_UNLOCKED=true
  fi
  command claude "$@"
}
ZSHRC

# -----------------------------------------------------------------------------
# 15. Git config
# -----------------------------------------------------------------------------
echo "Setting git config..."
git config --global user.name "trwpang"
git config --global user.email "134544126+trwpang@users.noreply.github.com"
git config --global init.defaultBranch master
git config --global pull.rebase true

# -----------------------------------------------------------------------------
# 16. Claude Code config
# -----------------------------------------------------------------------------
mkdir -p ~/.claude
echo "Claude Code installed. Run 'claude' to authenticate on first use."

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo ""
echo "============================================"
echo "Bootstrap complete!"
echo "============================================"
echo ""
echo "Remaining manual steps:"
echo "  1. Run 'claude' to authenticate Claude Code"
echo "  2. Run 'codex' to authenticate Codex CLI"
echo "  3. Set GEMINI_API_KEY in ~/.zshrc (check Doppler or copy from MacBook)"
echo "  4. Copy ~/.claude/ skills and settings from MacBook if needed"
echo "  5. Adjust ~/.zazigv2/config.json slot counts for this machine's capacity"
echo "  6. Run 'zazig start' to join the pipeline"
echo ""
echo "Quick test:"
echo "  source ~/.zshrc"
echo "  node -v && claude --version && zazig --version"
