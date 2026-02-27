#!/bin/sh
#
# HomeProxy Routing Management
#

. /usr/libexec/homeproxy/lib.sh

# Get current routing mode
routing_get() {
    local mode=$(uci get homeproxy.config.routing_mode 2>/dev/null)
    local port=$(uci get homeproxy.config.routing_port 2>/dev/null)
    local proxy_mode=$(uci get homeproxy.config.proxy_mode 2>/dev/null)
    
    echo "Routing Mode: $mode"
    echo "Routing Port: $port"
    echo "Proxy Mode: $proxy_mode"
}

# Set routing mode
routing_set() {
    require_root
    local mode="$1"
    
    if [ -z "$mode" ]; then
        log_error "Mode required"
        log_info "Available modes:"
        echo "  bypass_mainland_china - 绕过中国大陆 (默认)"
        echo "  proxy_mainland_china   - 代理中国大陆"
        echo "  proxy_all              - 全代理"
        echo "  direct_all             - 全直连"
        echo "  custom                 - 自定义"
        exit 1
    fi
    
    if ! validate_routing_mode "$mode"; then
        log_error "Invalid routing mode: $mode"
        exit 1
    fi
    
    uci set homeproxy.config.routing_mode="$mode"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "Routing mode set to: $mode"
}

# Get routing node
routing_get_node() {
    local main_node=$(uci get homeproxy.config.main_node 2>/dev/null)
    local udp_node=$(uci get homeproxy.config.main_udp_node 2>/dev/null)
    
    echo "Main Node: $main_node"
    echo "UDP Node: $udp_node"
}

# Set routing node
routing_set_node() {
    require_root
    local node_type="$1"
    local node_name="$2"
    
    if [ -z "$node_type" ] || [ -z "$node_name" ]; then
        log_error "Usage: routing set-node <main|udp> <node_name>"
        exit 1
    fi
    
    local node=$(find_node_by_name "$node_name")
    if [ -z "$node" ]; then
        log_error "Node not found: $node_name"
        exit 1
    fi
    
    case "$node_type" in
        main)
            uci set homeproxy.config.main_node="$node"
            ;;
        udp)
            uci set homeproxy.config.main_udp_node="$node"
            ;;
        *)
            log_error "Invalid node type: $node_type (use: main or udp)"
            exit 1
            ;;
    esac
    
    uci commit homeproxy
    reload_homeproxy
    
    log_info "Routing node set: $node_type = $node_name"
}

# List routing rules
routing_rules_list() {
    log_info "Routing Rules"
    echo "=============="
    
    # This would read from UCI routing config
    local default_out=$(uci get homeproxy.routing.default_outbound 2>/dev/null)
    echo "Default Outbound: $default_out"
}

# Add routing rule
routing_rule_add() {
    require_root
    local type="$1"  # domain, ip, etc
    local pattern="$2"
    local outbound="$3"
    
    if [ -z "$type" ] || [ -z "$pattern" ] || [ -z "$outbound" ]; then
        log_error "Usage: routing rule add <type> <pattern> <outbound>"
        exit 1
    fi
    
    # Simplified - would need proper UCI rule handling
    log_warn "Rule configuration not fully implemented"
    log_info "Pattern: $pattern -> $outbound"
}

# Show routing status
routing_status() {
    log_info "Routing Status"
    echo "==============="
    
    routing_get
    echo ""
    routing_get_node
}
