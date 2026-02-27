#!/bin/sh
#
# HomeProxy Node Management
#

. /usr/libexec/homeproxy/lib.sh

# List all nodes
node_list() {
    local format="${1:-text}"
    local nodes=$(get_all_nodes)
    
    if [ -z "$nodes" ]; then
        log_warn "No nodes found"
        return
    fi
    
    local main_node=$(uci get homeproxy.config.main_node 2>/dev/null)
    
    if [ "$format" = "json" ]; then
        echo "["
        local first=true
        for node in $nodes; do
            $first || echo ","
            first=false
            
            local label=$(uci get homeproxy.${node}.label 2>/dev/null || echo "$node")
            local address=$(uci get homeproxy.${node}.address 2>/dev/null || echo "-")
            local port=$(uci get homeproxy.${node}.port 2>/dev/null || echo "-")
            local type=$(uci get homeproxy.${node}.type 2>/dev/null || echo "-")
            
            local active="false"
            if [ "$main_node" = "$node" ]; then
                active="true"
            fi
            
            printf '  {"name": "%s", "label": "%s", "address": "%s", "port": "%s", "type": "%s", "active": %s}' \
                "$node" "$label" "$address" "$port" "$type" "$active"
        done
        echo ""
        echo "]"
    else
        printf "%-20s %-25s %-10s %s\n" "NAME" "ADDRESS" "TYPE" "STATUS"
        printf "%-20s %-25s %-10s %s\n" "----" "-------" "----" "------"
        
        for node in $nodes; do
            local label=$(uci get homeproxy.${node}.label 2>/dev/null || echo "$node")
            local addr=$(uci get homeproxy.${node}.address 2>/dev/null || echo "-")
            local port=$(uci get homeproxy.${node}.port 2>/dev/null || echo "-")
            local type=$(get_node_type_name "$(uci get homeproxy.${node}.type 2>/dev/null)")
            
            local status="[inactive]"
            if [ "$main_node" = "$node" ]; then
                status="[${GREEN}active${NC}]"
            fi
            
            printf "%-20s %-25s %-10s %s\n" "$label" "$addr:$port" "$type" "$status"
        done
    fi
}

# Test node connection
node_test() {
    local node_name="$1"
    
    if [ -z "$node_name" ]; then
        local main_node=$(uci get homeproxy.config.main_node 2>/dev/null)
        if [ -z "$main_node" ] || [ "$main_node" = "nil" ]; then
            log_error "No main node configured"
            exit 1
        fi
        node_name="$main_node"
    fi
    
    local node=$(find_node_by_name "$node_name")
    if [ -z "$node" ]; then
        log_error "Node not found: $node_name"
        exit 1
    fi
    
    log_info "Testing connection for node: $node"
    
    # Test Google
    local result=$(ubus call luci.homeproxy connection_check '{"site":"google"}' 2>/dev/null)
    if echo "$result" | grep -q '"result":true'; then
        log_info "Google: ${GREEN}PASS${NC}"
    else
        log_error "Google: FAIL"
    fi
    
    # Test Baidu
    result=$(ubus call luci.homeproxy connection_check '{"site":"baidu"}' 2>/dev/null)
    if echo "$result" | grep -q '"result":true'; then
        log_info "Baidu: ${GREEN}PASS${NC}"
    else
        log_error "Baidu: FAIL"
    fi
}

# Set main node
node_set_main() {
    require_root
    local node_name="$1"
    
    if [ -z "$node_name" ]; then
        log_error "Node name required"
        exit 1
    fi
    
    local node=$(find_node_by_name "$node_name")
    if [ -z "$node" ]; then
        log_error "Node not found: $node_name"
        exit 1
    fi
    
    uci set homeproxy.config.main_node="$node"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "Main node set to: $node_name"
}

# Add new node
node_add() {
    require_root
    local type="$1"
    local address="$2"
    local port="$3"
    shift 3
    local label="$*"
    
    if [ -z "$type" ] || [ -z "$address" ] || [ -z "$port" ]; then
        log_error "Usage: homeproxy node add <type> <address> <port> [label]"
        log_info "Valid types: vmess vless trojan shadowsocks hysteria2 socks http tuic wireguard"
        exit 1
    fi
    
    # Validate
    case "$type" in
        vmess|vless|trojan|shadowsocks|hysteria|hysteria2|socks|http|tuic|wireguard|direct) ;;
        *)
            log_error "Invalid node type: $type"
            exit 1
            ;;
    esac
    
    if ! validate_port "$port"; then
        log_error "Invalid port: $port"
        exit 1
    fi
    
    local node_name="node_$(date +%s)"
    
    uci add homeproxy node
    uci set homeproxy.@node[-1].type="$type"
    uci set homeproxy.@node[-1].address="$address"
    uci set homeproxy.@node[-1].port="$port"
    
    if [ -n "$label" ]; then
        uci set homeproxy.@node[-1].label="$label"
    else
        uci set homeproxy.@node[-1].label="${address}:${port}"
    fi
    
    uci commit homeproxy
    
    log_info "Node added: $node_name (${address}:${port})"
    log_info "Use 'homeproxy node set-main $node_name' to activate"
}

# Remove node
node_remove() {
    require_root
    local node_name="$1"
    
    if [ -z "$node_name" ]; then
        log_error "Node name required"
        exit 1
    fi
    
    local node=$(find_node_by_name "$node_name")
    if [ -z "$node" ]; then
        log_error "Node not found: $node_name"
        exit 1
    fi
    
    # Check if it's the main node
    local main_node=$(uci get homeproxy.config.main_node 2>/dev/null)
    if [ "$main_node" = "$node" ]; then
        uci set homeproxy.config.main_node="nil"
    fi
    
    uci delete homeproxy.$node
    uci commit homeproxy
    reload_homeproxy
    
    log_info "Node removed: $node_name"
}

# Edit node
node_edit() {
    require_root
    local node_name="$1"
    shift
    local key="$1"
    shift
    local value="$*"
    
    if [ -z "$node_name" ] || [ -z "$key" ]; then
        log_error "Usage: homeproxy node edit <name> <key> <value>"
        exit 1
    fi
    
    local node=$(find_node_by_name "$node_name")
    if [ -z "$node" ]; then
        log_error "Node not found: $node_name"
        exit 1
    fi
    
    uci set homeproxy.${node}.${key}="$value"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "Node $node_name updated: $key = $value"
}

# Import nodes from URL
node_import() {
    require_root
    local url="$1"
    
    if [ -z "$url" ]; then
        log_error "Subscription URL required"
        exit 1
    fi
    
    log_info "Importing nodes from: $url"
    
    # Add as subscription temporarily
    uci add_list homeproxy.subscription.subscription_url="$url"
    uci commit homeproxy
    
    # Note: Full import requires the update script
    log_info "Subscription added. Run 'homeproxy subscription update' to import nodes."
}

# Export nodes
node_export() {
    local node_name="$1"
    
    if [ -z "$node_name" ]; then
        # Export all
        local nodes=$(get_all_nodes)
        for node in $nodes; do
            # This would generate share links - simplified here
            local label=$(uci get homeproxy.${node}.label 2>/dev/null)
            echo "$label"
        done
    else
        local node=$(find_node_by_name "$node_name")
        if [ -z "$node" ]; then
            log_error "Node not found: $node_name"
            exit 1
        fi
        # Export single node info
        uci show homeproxy.$node
    fi
}
