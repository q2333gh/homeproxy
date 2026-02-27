#!/bin/sh
#
# HomeProxy CLI Install Script
#
# Prefers Go CLI (cli-go/) when Go is available; falls back to shell CLI.
#

set -e

INSTALL_DIR="/usr/libexec/homeproxy"
BIN_DIR="/usr/bin"
CONFIG_DIR="/etc/homeproxy"
SCRIPT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

log_info() {
    echo "[INFO] $1"
}

log_error() {
    echo "[ERROR] $1" >&2
}

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    log_error "Please run as root"
    exit 1
fi

log_info "Installing HomeProxy CLI..."

mkdir -p "$CONFIG_DIR"

# Prefer Go CLI if build succeeds
if command -v go >/dev/null 2>&1; then
    if (cd "$SCRIPT_ROOT/cli-go" && go build -o homeproxy ./cmd/homeproxy) 2>/dev/null; then
        log_info "Installing Go CLI..."
        cp "$SCRIPT_ROOT/cli-go/homeproxy" "$BIN_DIR/homeproxy"
        chmod +x "$BIN_DIR/homeproxy"
    else
        log_info "Go build failed, installing shell CLI..."
        install_shell_cli
    fi
else
    log_info "Go not found, installing shell CLI..."
    install_shell_cli
fi

install_shell_cli() {
    mkdir -p "$INSTALL_DIR/lib"
    cp "$SCRIPT_ROOT/cli/lib/homeproxy.sh" "$INSTALL_DIR/lib.sh"
    cp "$SCRIPT_ROOT/cli/lib/node.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_ROOT/cli/lib/routing.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_ROOT/cli/lib/dns.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_ROOT/cli/lib/subscription.sh" "$INSTALL_DIR/lib/"
    cp "$SCRIPT_ROOT/cli/homeproxy" "$BIN_DIR/homeproxy"
    chmod +x "$BIN_DIR/homeproxy"
}

# Install configuration
log_info "Installing configuration..."
cp "$SCRIPT_ROOT/cli/etc/homeproxy.conf" "$CONFIG_DIR/cli.conf"

# Create bash completion
log_info "Installing bash completion..."
cat > /etc/bash_completion.d/homeproxy << 'COMPLETION'
_homeproxy() {
    local cur prev commands
    
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    
    commands="node routing dns subscription status log control features help"
    
    case "${COMP_CWORD}" in
        1)
            COMPREPLY=($(compgen -W "${commands}" -- ${cur}))
            ;;
        2)
            case "${prev}" in
                node)
                    COMPREPLY=($(compgen -W "list test set-main add remove edit import export" -- ${cur}))
                    ;;
                routing)
                    COMPREPLY=($(compgen -W "get set set-node status" -- ${cur}))
                    ;;
                dns)
                    COMPREPLY=($(compgen -W "get set set-china status test cache strategy" -- ${cur}))
                    ;;
                subscription)
                    COMPREPLY=($(compgen -W "list add remove update auto-update filter status" -- ${cur}))
                    ;;
                log)
                    COMPREPLY=($(compgen -W "homeproxy sing-box-c sing-box-s" -- ${cur}))
                    ;;
                control)
                    COMPREPLY=($(compgen -W "start stop restart status" -- ${cur}))
                    ;;
            esac
            ;;
    esac
    
    return 0
}

complete -F _homeproxy homeproxy
COMPLETION

log_info "Installation complete!"
log_info ""
log_info "Usage:"
log_info "  homeproxy node list           - List all nodes"
log_info "  homeproxy node set-main <name> - Set main node"
log_info "  homeproxy routing set <mode>   - Set routing mode"
log_info "  homeproxy status               - Show status"
log_info ""
log_info "For more commands, run: homeproxy help"
