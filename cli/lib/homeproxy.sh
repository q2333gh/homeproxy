#!/bin/sh
#
# HomeProxy CLI Library
# Common functions for homeproxy commands
#

# Load configuration
[ -f /etc/homeproxy/cli.conf ] && . /etc/homeproxy/cli.conf

# Colors (if enabled)
if [ "$COLOR_OUTPUT" != "false" ]; then
    RED='\033[0;31m'
    GREEN='\033[0;32m'
    YELLOW='\033[1;33m'
    BLUE='\033[0;34m'
    NC='\033[0m'
else
    RED=''
    GREEN=''
    YELLOW=''
    BLUE=''
    NC=''
fi

# Logging functions
log_info() {
    echo "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo "${RED}[ERROR]${NC} $1" >&2
}

log_debug() {
    [ "$DEBUG" = "true" ] && echo "${BLUE}[DEBUG]${NC} $1"
}

# Check if running as root
require_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This command requires root privileges"
        exit 1
    fi
}

# Check if HomeProxy is installed
check_installed() {
    if [ ! -f "$CONFIG_FILE" ]; then
        log_error "HomeProxy is not installed"
        exit 1
    fi
}

# Check if HomeProxy is running
check_running() {
    if ! $INIT_SCRIPT status &>/dev/null; then
        log_warn "HomeProxy is not running"
        return 1
    fi
    return 0
}

# Reload HomeProxy
reload_homeproxy() {
    log_info "Reloading HomeProxy..."
    $INIT_SCRIPT reload
}

# Parse node type
get_node_type_name() {
    local type="$1"
    case "$type" in
        vmess) echo "VMess" ;;
        vless) echo "VLESS" ;;
        trojan) echo "Trojan" ;;
        shadowsocks) echo "Shadowsocks" ;;
        hysteria) echo "Hysteria" ;;
        hysteria2) echo "Hysteria2" ;;
        socks) echo "SOCKS" ;;
        http) echo "HTTP" ;;
        tuic) echo "TUIC" ;;
        wireguard) echo "WireGuard" ;;
        direct) echo "Direct" ;;
        *) echo "$type" ;;
    esac
}

# Format output as table
print_table() {
    local header="$1"
    shift
    local data="$@"
    
    if [ -z "$data" ]; then
        return
    fi
    
    printf "$header\n"
    printf "%s\n" "$data"
}

# Check command exists
require_command() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        log_error "Required command not found: $cmd"
        exit 1
    fi
}

# Validate node name
validate_node_name() {
    local name="$1"
    
    if [ -z "$name" ]; then
        log_error "Node name cannot be empty"
        return 1
    fi
    
    if ! echo "$name" | grep -qE '^[a-zA-Z0-9_-]+$'; then
        log_error "Invalid node name: $name (use only alphanumeric, underscore, hyphen)"
        return 1
    fi
    
    return 0
}

# Validate IP address
validate_ip() {
    local ip="$1"
    
    if echo "$ip" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$'; then
        return 0
    fi
    
    if echo "$ip" | grep -qE '^[0-9a-fA-F:]+$'; then
        return 0
    fi
    
    return 1
}

# Validate port
validate_port() {
    local port="$1"
    
    if [ -z "$port" ]; then
        return 1
    fi
    
    if [ "$port" -ge 1 ] && [ "$port" -le 65535 ] 2>/dev/null; then
        return 0
    fi
    
    return 1
}

# Validate routing mode
validate_routing_mode() {
    local mode="$1"
    
    case "$mode" in
        bypass_mainland_china|proxy_mainland_china|proxy_all|direct_all|custom)
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Get all node names
get_all_nodes() {
    uci show homeproxy 2>/dev/null | grep "=node" | cut -d'.' -f2 | cut -d'=' -f1
}

# Get node by name or label
find_node_by_name() {
    local name="$1"
    
    # Direct match
    if uci get homeproxy.${name} &>/dev/null; then
        echo "$name"
        return
    fi
    
    # Match by label
    local nodes=$(get_all_nodes)
    for node in $nodes; do
        local label=$(uci get homeproxy.${node}.label 2>/dev/null)
        if [ "$label" = "$name" ]; then
            echo "$node"
            return
        fi
    done
}

# JSON escape (basic)
json_escape() {
    printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

# Output in JSON format
output_json() {
    local key="$1"
    local value="$2"
    printf '{"%s": "%s"}' "$key" "$(json_escape "$value")"
}
