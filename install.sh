#!/usr/bin/env bash
set -e

# AI Orbiter Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/alesha-pro/ai-orbiter/main/install.sh | bash

REPO_URL="https://github.com/alesha-pro/ai-orbiter.git"
INSTALL_DIR="${AI_ORBITER_HOME:-$HOME/.ai-orbiter}"
MIN_NODE_VERSION=18

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo ""
echo -e "${BLUE}"
echo "    _    ___    ___       _     _ _            "
echo "   / \  |_ _|  / _ \ _ __| |__ (_) |_ ___ _ __ "
echo "  / _ \  | |  | | | | '__| '_ \| | __/ _ \ '__|"
echo " / ___ \ | |  | |_| | |  | |_) | | ||  __/ |   "
echo "/_/   \_\___|  \___/|_|  |_.__/|_|\__\___|_|   "
echo -e "${NC}"
echo ""

# Check Node.js
check_node() {
    if ! command -v node &> /dev/null; then
        error "Node.js is not installed. Please install Node.js >= $MIN_NODE_VERSION first.\n  https://nodejs.org/"
    fi
    
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -lt "$MIN_NODE_VERSION" ]; then
        error "Node.js version $MIN_NODE_VERSION+ required. Current: $(node -v)"
    fi
    success "Node.js $(node -v)"
}

check_pnpm() {
    if ! command -v pnpm &> /dev/null; then
        warn "pnpm is not installed. Installing..."
        npm install -g pnpm || corepack enable && corepack prepare pnpm@latest --activate || error "Failed to install pnpm"
    fi
    
    if ! pnpm bin -g &> /dev/null; then
        warn "Setting up pnpm global bin directory..."
        pnpm setup 2>/dev/null || true
        export PNPM_HOME="$HOME/.local/share/pnpm"
        export PATH="$PNPM_HOME:$PATH"
    fi
    success "pnpm $(pnpm -v)"
}

# Check git
check_git() {
    if ! command -v git &> /dev/null; then
        error "git is not installed. Please install git first."
    fi
    success "git $(git --version | cut -d' ' -f3)"
}

# Check build tools (for better-sqlite3)
check_build_tools() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if ! xcode-select -p &> /dev/null; then
            warn "Xcode Command Line Tools not found. Installing..."
            xcode-select --install 2>/dev/null || warn "Please run 'xcode-select --install' manually if build fails"
        fi
    fi
}

# Main installation
install() {
    info "Checking dependencies..."
    check_git
    check_node
    check_pnpm
    check_build_tools
    echo ""

    # Remove old installation
    if [ -d "$INSTALL_DIR" ]; then
        warn "Existing installation found at $INSTALL_DIR"
        read -p "Remove and reinstall? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            info "Removing old installation..."
            # Unlink global first
            (cd "$INSTALL_DIR" && pnpm unlink --global 2>/dev/null) || true
            rm -rf "$INSTALL_DIR"
        else
            error "Installation cancelled"
        fi
    fi

    # Clone
    info "Cloning repository..."
    git clone --depth 1 "$REPO_URL" "$INSTALL_DIR" || error "Failed to clone repository"

    # Install dependencies
    info "Installing dependencies (this may take a while)..."
    cd "$INSTALL_DIR"
    pnpm install || error "Failed to install dependencies"

    # Build
    info "Building..."
    pnpm build || error "Build failed"

    info "Linking globally..."
    if ! pnpm link --global 2>/dev/null; then
        warn "pnpm global bin not configured. Running pnpm setup..."
        pnpm setup
        export PNPM_HOME="$HOME/.local/share/pnpm"
        export PATH="$PNPM_HOME:$PATH"
        pnpm link --global || error "Failed to link globally"
    fi

    echo ""
    success "AI Orbiter installed successfully!"
    echo ""
    echo -e "  Run ${GREEN}ai-orbiter start${NC} to launch"
    echo ""
    echo -e "  ${YELLOW}NOTE:${NC} You may need to restart your terminal or run:"
    echo -e "    source ~/.bashrc  ${BLUE}(or ~/.zshrc)${NC}"
    echo ""
    echo -e "  Installation directory: ${BLUE}$INSTALL_DIR${NC}"
    echo ""
    echo -e "  To uninstall:"
    echo -e "    cd $INSTALL_DIR && pnpm unlink --global && rm -rf $INSTALL_DIR"
    echo ""
}

# Run
install
