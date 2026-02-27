#!/bin/sh
#
# HomeProxy DNS Management
#

. /usr/libexec/homeproxy/lib.sh

# Get DNS settings
dns_get() {
    local dns=$(uci get homeproxy.config.dns_server 2>/dev/null)
    local china_dns=$(uci get homeproxy.config.china_dns_server 2>/dev/null)
    local strategy=$(uci get homeproxy.dns.dns_strategy 2>/dev/null)
    local disable_cache=$(uci get homeproxy.dns.disable_cache 2>/dev/null)
    
    echo "DNS Server: $dns"
    echo "China DNS: $china_dns"
    echo "Strategy: $strategy"
    echo "Cache: $([ "$disable_cache" = "0" ] && echo "enabled" || echo "disabled")"
}

# Set main DNS server
dns_set() {
    require_root
    local server="$1"
    
    if [ -z "$server" ]; then
        log_error "DNS server required"
        exit 1
    fi
    
    uci set homeproxy.config.dns_server="$server"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "DNS server set to: $server"
}

# Set China DNS server
dns_set_china() {
    require_root
    local server="$1"
    
    if [ -z "$server" ]; then
        log_error "China DNS server required"
        exit 1
    fi
    
    uci set homeproxy.config.china_dns_server="$server"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "China DNS server set to: $server"
}

# Get DNS status
dns_status() {
    log_info "DNS Status"
    echo "==========="
    dns_get
    
    echo ""
    log_info "Testing DNS..."
    
    # Test DNS resolution
    if command -v nslookup >/dev/null 2>&1; then
        nslookup google.com 8.8.8.8 2>/dev/null | grep "Name:" -A1 || log_warn "DNS test failed"
    fi
}

# DNS test
dns_test() {
    local domain="${1:-google.com}"
    local dns="${2:-8.8.8.8}"
    
    log_info "Testing DNS: $domain via $dns"
    
    if command -v nslookup >/dev/null 2>&1; then
        result=$(nslookup "$domain" "$dns" 2>&1)
        if echo "$result" | grep -q "Address:"; then
            log_info "DNS resolution: OK"
            echo "$result" | grep "Address:" | tail -1
        else
            log_error "DNS resolution: FAIL"
        fi
    elif command -v dig >/dev/null 2>&1; then
        result=$(dig +short @"$dns" "$domain" 2>/dev/null)
        if [ -n "$result" ]; then
            log_info "DNS resolution: OK"
            echo "$result"
        else
            log_error "DNS resolution: FAIL"
        fi
    else
        log_error "No DNS lookup tool available"
    fi
}

# DNS cache control
dns_cache() {
    require_root
    local action="$1"
    
    case "$action" in
        enable)
            uci set homeproxy.dns.disable_cache="0"
            log_info "DNS cache enabled"
            ;;
        disable)
            uci set homeproxy.dns.disable_cache="1"
            log_info "DNS cache disabled"
            ;;
        *)
            log_error "Usage: dns cache <enable|disable>"
            exit 1
            ;;
    esac
    
    uci commit homeproxy
    reload_homeproxy
}

# DNS strategy
dns_strategy() {
    require_root
    local strategy="$1"
    
    if [ -z "$strategy" ]; then
        log_info "Current: $(uci get homeproxy.dns.dns_strategy 2>/dev/null)"
        log_info "Options_ipv4,: prefer prefer_ipv6, ipv4_only, ipv6_only"
        exit 0
    fi
    
    case "$strategy" in
        prefer_ipv4|prefer_ipv6|ipv4_only|ipv6_only) ;;
        *)
            log_error "Invalid strategy: $strategy"
            exit 1
            ;;
    esac
    
    uci set homeproxy.dns.dns_strategy="$strategy"
    uci commit homeproxy
    reload_homeproxy
    
    log_info "DNS strategy set to: $strategy"
}
