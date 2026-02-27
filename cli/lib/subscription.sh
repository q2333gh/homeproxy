#!/bin/sh
#
# HomeProxy Subscription Management
#

. /usr/libexec/homeproxy/lib.sh

# List subscriptions
subscription_list() {
    local urls=$(uci get homeproxy.subscription.subscription_url 2>/dev/null)
    
    if [ -z "$urls" ]; then
        log_warn "No subscriptions configured"
        return
    fi
    
    log_info "Subscriptions:"
    echo "$urls" | tr ' ' '\n' | nl -w2 -s". "
    
    # Show filter keywords
    local filters=$(uci get homeproxy.subscription.filter_keywords 2>/dev/null)
    if [ -n "$filters" ]; then
        echo ""
        log_info "Filter keywords:"
        echo "$filters" | tr ' ' '\n' | nl -w2 -s". "
    fi
}

# Add subscription
subscription_add() {
    require_root
    local url="$1"
    
    if [ -z "$url" ]; then
        log_error "Subscription URL required"
        exit 1
    fi
    
    # Validate URL
    case "$url" in
        http://*|https://*) ;;
        *)
            log_error "Invalid URL: $url"
            exit 1
            ;;
    esac
    
    # Check for duplicates
    local existing=$(uci get homeproxy.subscription.subscription_url 2>/dev/null)
    if echo "$existing" | grep -q "$url"; then
        log_warn "Subscription already exists: $url"
        return
    fi
    
    uci add_list homeproxy.subscription.subscription_url="$url"
    uci commit homeproxy
    
    log_info "Subscription added: $url"
}

# Remove subscription
subscription_remove() {
    require_root
    local url="$1"
    
    if [ -z "$url" ]; then
        # Remove all
        log_warn "Removing all subscriptions..."
        uci delete homeproxy.subscription.subscription_url
    else
        # Remove specific URL
        local existing=$(uci get homeproxy.subscription.subscription_url 2>/dev/null)
        local new_urls=""
        
        for u in $existing; do
            if [ "$u" != "$url" ]; then
                new_urls="$new_urls $u"
            fi
        done
        
        uci delete homeproxy.subscription.subscription_url
        for u in $new_urls; do
            uci add_list homeproxy.subscription.subscription_url="$u"
        done
    fi
    
    uci commit homeproxy
    log_info "Subscription removed: $url (or all if no URL specified)"
}

# Update subscriptions
subscription_update() {
    require_root
    check_installed
    
    log_info "Updating subscriptions..."
    
    if [ -f /etc/homeproxy/scripts/update_subscriptions.uc ]; then
        /etc/homeproxy/scripts/update_subscriptions.uc
        log_info "Subscriptions updated"
        
        # Show new nodes
        echo ""
        log_info "Imported nodes:"
        node_list
    else
        log_error "Update script not found"
        exit 1
    fi
}

# Set auto-update
subscription_auto_update() {
    require_root
    local enable="$1"
    
    case "$enable" in
        enable|on|1|true)
            uci set homeproxy.subscription.auto_update="1"
            log_info "Auto-update enabled"
            ;;
        disable|off|0|false)
            uci set homeproxy.subscription.auto_update="0"
            log_info "Auto-update disabled"
            ;;
        *)
            log_error "Usage: subscription auto-update <enable|disable>"
            exit 1
            ;;
    esac
    
    uci commit homeproxy
}

# Filter keywords
subscription_filter() {
    require_root
    local action="$1"
    shift
    local keyword="$*"
    
    case "$action" in
        add)
            if [ -z "$keyword" ]; then
                log_error "Keyword required"
                exit 1
            fi
            uci add_list homeproxy.subscription.filter_keywords="$keyword"
            log_info "Filter keyword added: $keyword"
            ;;
        remove)
            if [ -z "$keyword" ]; then
                log_error "Keyword required"
                exit 1
            fi
            # UCI doesn't have easy list removal, need to rebuild
            log_warn "Filter removal not fully implemented"
            ;;
        list)
            local filters=$(uci get homeproxy.subscription.filter_keywords 2>/dev/null)
            if [ -n "$filters" ]; then
                echo "$filters" | tr ' ' '\n' | nl -w2 -s". "
            else
                log_warn "No filter keywords"
            fi
            ;;
        clear)
            uci delete homeproxy.subscription.filter_keywords
            log_info "Filter keywords cleared"
            ;;
        *)
            log_error "Usage: subscription filter <add|remove|list|clear> [keyword]"
            exit 1
            ;;
    esac
    
    uci commit homeproxy
}

# Subscription status
subscription_status() {
    log_info "Subscription Status"
    echo "====================="
    
    local auto_update=$(uci get homeproxy.subscription.auto_update 2>/dev/null)
    local allow_insecure=$(uci get homeproxy.subscription.allow_insecure 2>/dev/null)
    local update_time=$(uci get homeproxy.subscription.auto_update_time 2>/dev/null)
    local filter_mode=$(uci get homeproxy.subscription.filter_nodes 2>/dev/null)
    
    echo "Auto-update: $([ "$auto_update" = "1" ] && echo "enabled" || echo "disabled")"
    [ -n "$update_time" ] && echo "Update time: $update_time:00"
    echo "Allow insecure: $([ "$allow_insecure" = "1" ] && echo "yes" || echo "no")"
    echo "Filter mode: $filter_mode"
    
    echo ""
    subscription_list
}
