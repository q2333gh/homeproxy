# homeproxy

## User Guide

### Install

Install both the HomeProxy main package and the standalone CLI package on OpenWrt:

```bash
opkg update
opkg install /tmp/luci-app-homeproxy_*.ipk
opkg install /tmp/homeproxy-cli_*.ipk
```

### Configure with Agent(such as openai codex)

Use the `homeproxy` CLI to complete initial setup:

```bash
# 1) Import share link(s)
homeproxy node import 'hy2://password@1.2.3.4:443?sni=example.com#node-a'

# 2) List nodes and set main node
homeproxy node list
homeproxy node set-main node-a

# 3) Apply changes and restart service
homeproxy control restart

# 4) Check runtime status
homeproxy status --json
```

## Compatibility and Dependencies

### Minimum Compatibility Baseline

The minimum usable firmware must provide:

- Firewall stack must be `firewall4` with nftables includes (`type=nftables`, `fw4 reload` usage).
- Must provide `ucode` runtime (multiple `#!/usr/bin/ucode` scripts and RPC backend).
- Must provide `procd` init framework (`USE_PROCD=1`).

### Core Dependencies

Defined by `LUCI_DEPENDS` in `Makefile`:

- `sing-box`
- `firewall4`
- `kmod-nft-tproxy`
- `ucode-mod-digest`

### Runtime Peripheral Requirements

Runtime also requires:

- `dnsmasq` (restart/reload and conf-dir injection)
- `fw4` / nftables include mechanism
- `ip` tooling with policy routing + tuntap operations (`ip rule`, `ip route`, `ip tuntap`)
- `ubus`, `rpcd`, `uci`, `ucode`, `utpl`
- `wget` (connection check and resource/subscription fetch)
- `jsonfilter` (resource update script parses GitHub API response)
- `cron` (`/etc/crontabs/root` auto-update path)

### Optional / Mode-Dependent Requirements

- `kmod-tun` (or equivalent tun support) when using TUN-related modes; runtime checks `tun.ko`/`/etc/modules.d/30-tun`.
- `ujail` is optional hardening path (`/sbin/ujail` existence-gated).
- `ca-certificates`-style trust store is required in practice for HTTPS fetch/validation paths (`wget`/`sing-box` TLS usage).

## Dev Notes

### Count Code Lines

```bash
cloc . --exclude-dir=sing-box-ref,.git,.cursor,terminals --git --timeout 0 > cloc.md 2>&1 || echo 'CLOC_MISSING' >> cloc.md
```

### Upstream homeproxy1 creates TODO

- Subscription page slow response with a large number of nodes
- Refactor nft rules
- Move ACL settings to a dedicated page
- Any other improvements
