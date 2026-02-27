#!/bin/sh
#
# HomeProxy CLI Install Script
#

set -e

INSTALL_DIR="/usr/libexec/homeproxy"
BIN_DIR="/usr/bin"
MAN_DIR="/usr/share/man/man1"
CONFIG_DIR="/etc/homeproxy"

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

# Create directories
mkdir -p "$INSTALL_DIR/lib"
mkdir -p "$CONFIG_DIR"

# Install library
log_info "Installing library..."
cp lib/homeproxy.sh "$INSTALL_DIR/lib.sh"

# Install modules
log_info "Installing modules..."
cp lib/node.sh "$INSTALL_DIR/lib/"
cp lib/routing.sh "$INSTALL_DIR/lib/"
cp lib/dns.sh "$INSTALL_DIR/lib/"
cp lib/subscription.sh "$INSTALL_DIR/lib/"

# Install main script
log_info "Installing main script..."
cp cli/homeproxy "$BIN_DIR/homeproxy"
chmod +x "$BIN_DIR/homeproxy"

# Install configuration
log_info "Installing configuration..."
cp etc/homeproxy.conf "$CONFIG_DIR/cli.conf"

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
                    COMPREPLY=($(compgen -W "get set set-node rules status" -- ${cur}))
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
                    COMPREPLY=($(compgen -W "start stop restart" -- ${cur}))
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
