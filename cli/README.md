# HomeProxy CLI

HomeProxy command line interface for managing the HomeProxy proxy client on OpenWrt.

## Features

- Node management (list, add, remove, test, set main)
- Routing mode control
- DNS configuration
- Subscription management
- Service control (start, stop, restart)
- Real-time logging

## Requirements

- OpenWrt with HomeProxy installed
- ubus (for RPC calls)
- UCI (for configuration)

## Installation

```bash
cd cli
chmod +x install.sh
./install.sh
```

## Usage

### Node Management

```bash
# List all nodes
homeproxy node list

# Test connection
homeproxy node test
homeproxy node test mynode

# Set main node
homeproxy node set-main mynode

# Add new node
homeproxy node add vmess 1.2.3.4 443 "My Node"

# Remove node
homeproxy node remove mynode
```

### Routing

```bash
# Get current routing mode
homeproxy routing get

# Set routing mode
homeproxy routing set bypass_mainland_china
homeproxy routing set proxy_all
homeproxy routing set direct_all
```

### DNS

```bash
# Get DNS settings
homeproxy dns get

# Set DNS server
homeproxy dns set 8.8.8.8

# Test DNS
homeproxy dns test google.com
```

### Subscription

```bash
# List subscriptions
homeproxy subscription list

# Add subscription
homeproxy subscription add https://example.com/sub

# Update subscriptions
homeproxy subscription update
```

### Status & Logs

```bash
# Show status
homeproxy status

# View logs
homeproxy log
homeproxy log sing-box-c

# Show features
homeproxy features
```

### Service Control

```bash
homeproxy control start
homeproxy control stop
homeproxy control restart
```

## Configuration

Configuration file: `/etc/homeproxy/cli.conf`

```bash
# Enable/disable color output
COLOR_OUTPUT=true

# Default log lines
DEFAULT_LOG_LINES=50

# Debug mode
DEBUG=false
```

## Architecture

```
cli/
├── homeproxy          # Main script
├── install.sh        # Installation script
├── bin/              # Additional binaries
├── lib/              # Library modules
│   ├── homeproxy.sh  # Common functions
│   ├── node.sh       # Node management
│   ├── routing.sh    # Routing management
│   ├── dns.sh        # DNS management
│   └── subscription.sh # Subscription management
└── etc/
    └── homeproxy.conf # Configuration
```

## License

GPL-2.0
