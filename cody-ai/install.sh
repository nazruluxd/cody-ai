#!/usr/bin/env bash
# install.sh — Cody AI Coding Assistant installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/your-org/cody-ai/main/install.sh | bash

set -e

REPO_URL="https://github.com/your-org/cody-ai"
INSTALL_DIR="$HOME/.cody-ai"
MIN_NODE_VERSION=18

# ── Colors ──────────────────────────────────────────────────────────────────
bold="\033[1m"
cyan="\033[36m"
green="\033[32m"
yellow="\033[33m"
red="\033[31m"
gray="\033[90m"
reset="\033[0m"

log()     { echo -e "${cyan}  ◆${reset} $*"; }
success() { echo -e "${green}  ✓${reset} $*"; }
warn()    { echo -e "${yellow}  ⚠${reset} $*"; }
error()   { echo -e "${red}  ✗${reset} $*"; exit 1; }
dim()     { echo -e "${gray}    $*${reset}"; }

echo ""
echo -e "${bold}${cyan}  Cody AI Coding Assistant — Installer${reset}"
echo -e "${gray}  ────────────────────────────────────────${reset}"
echo ""

# ── Detect OS ────────────────────────────────────────────────────────────────
OS="$(uname -s)"
case "$OS" in
  Linux*)   PLATFORM="linux" ;;
  Darwin*)  PLATFORM="macos" ;;
  *)        error "Unsupported OS: $OS. Use install.ps1 on Windows." ;;
esac
log "Platform: $PLATFORM"

# ── Check/Install Node.js ────────────────────────────────────────────────────
check_node() {
  if command -v node &> /dev/null; then
    local ver
    ver=$(node -e "process.exit(+process.versions.node.split('.')[0] < $MIN_NODE_VERSION ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
    if [ "$ver" = "ok" ]; then
      success "Node.js $(node --version) found"
      return 0
    else
      warn "Node.js $(node --version) is too old (need v${MIN_NODE_VERSION}+)"
      return 1
    fi
  fi
  return 1
}

install_node_via_fnm() {
  log "Installing Node.js via fnm (Fast Node Manager)..."
  curl -fsSL https://fnm.vercel.app/install | bash -s -- --skip-shell
  export PATH="$HOME/.local/share/fnm:$PATH"
  eval "$(fnm env)"
  fnm install --lts
  fnm use lts-latest
  success "Node.js $(node --version) installed"
}

install_node_via_homebrew() {
  if command -v brew &> /dev/null; then
    log "Installing Node.js via Homebrew..."
    brew install node
    success "Node.js $(node --version) installed"
  else
    return 1
  fi
}

if ! check_node; then
  log "Node.js not found — installing..."
  if [ "$PLATFORM" = "macos" ]; then
    install_node_via_homebrew || install_node_via_fnm
  else
    install_node_via_fnm
  fi
fi

# ── Install Cody ─────────────────────────────────────────────────────────────
log "Installing Cody from $REPO_URL..."

# Remove existing install
rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# Clone the repository
if command -v git &> /dev/null; then
  git clone --depth=1 "$REPO_URL" "$INSTALL_DIR" 2>/dev/null || {
    error "Failed to clone $REPO_URL\nMake sure git is installed and you have internet access."
  }
else
  error "git is required. Install it with: sudo apt install git  (or brew install git on macOS)"
fi

success "Repository cloned to $INSTALL_DIR"

# Install npm dependencies
log "Installing dependencies..."
cd "$INSTALL_DIR"
npm install --omit=dev --silent 2>/dev/null || npm install --production --silent
success "Dependencies installed"

# Make the binary executable
chmod +x "$INSTALL_DIR/bin/cody.js"

# ── Link to PATH ──────────────────────────────────────────────────────────────
LINK_DIR="/usr/local/bin"

# Try /usr/local/bin first, fall back to ~/.local/bin
if [ -w "$LINK_DIR" ]; then
  ln -sf "$INSTALL_DIR/bin/cody.js" "$LINK_DIR/cody"
else
  LINK_DIR="$HOME/.local/bin"
  mkdir -p "$LINK_DIR"
  ln -sf "$INSTALL_DIR/bin/cody.js" "$LINK_DIR/cody"
  # Check if ~/.local/bin is in PATH
  if [[ ":$PATH:" != *":$LINK_DIR:"* ]]; then
    warn "$LINK_DIR is not in your PATH."
    warn "Add this to your ~/.bashrc or ~/.zshrc:"
    echo ""
    dim 'export PATH="$HOME/.local/bin:$PATH"'
    echo ""
  fi
fi

success "Cody linked to $LINK_DIR/cody"

# ── API key setup ─────────────────────────────────────────────────────────────
echo ""
if [ -z "$ANTHROPIC_API_KEY" ]; then
  warn "ANTHROPIC_API_KEY is not set."
  echo ""
  dim "Add this to your ~/.bashrc or ~/.zshrc:"
  dim 'export ANTHROPIC_API_KEY=sk-ant-...'
  echo ""
  dim "Get your API key at: https://console.anthropic.com/"
else
  success "ANTHROPIC_API_KEY is already set"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${green}${bold}  Cody installed successfully!${reset}"
echo ""
dim "Start it in any project directory:"
echo ""
echo -e "    ${cyan}cd your-project${reset}"
echo -e "    ${cyan}cody${reset}"
echo ""
dim "Or run a one-shot command:"
echo -e "    ${cyan}cody \"explain the auth flow\"${reset}"
echo ""
