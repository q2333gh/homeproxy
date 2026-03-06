# homeproxy

## 用户指南

### 安装

在 OpenWrt 上安装 HomeProxy 主包与 CLI 包（CLI 为独立 IPK）：

```bash
opkg update
opkg install /tmp/luci-app-homeproxy_*.ipk
opkg install /tmp/homeproxy-cli_*.ipk
```

### 用 Agent 配置

使用 `homeproxy` 命令完成首次配置：

```bash
# 1) 导入分享链接
homeproxy node import 'hy2://password@1.2.3.4:443?sni=example.com#node-a'

# 2) 查看节点并设置主节点
homeproxy node list
homeproxy node set-main node-a

# 3) 应用并重启服务
homeproxy control restart

# 4) 查看运行状态
homeproxy status --json
```

## 兼容性与依赖

### 最低兼容基线

最低可用固件需满足以下能力：

- Firewall stack must be `firewall4` with nftables includes (`type=nftables`, `fw4 reload` usage).
- Must provide `ucode` runtime (multiple `#!/usr/bin/ucode` scripts and RPC backend).
- Must provide `procd` init framework (`USE_PROCD=1`).

### 核心依赖

`Makefile` 的 `LUCI_DEPENDS`：

- `sing-box`
- `firewall4`
- `kmod-nft-tproxy`
- `ucode-mod-digest`

### 运行时周边依赖

运行所需周边组件：

- `dnsmasq` (restart/reload and conf-dir injection)
- `fw4` / nftables include mechanism
- `ip` tooling with policy routing + tuntap operations (`ip rule`, `ip route`, `ip tuntap`)
- `ubus`, `rpcd`, `uci`, `ucode`, `utpl`
- `wget` (connection check and resource/subscription fetch)
- `jsonfilter` (resource update script parses GitHub API response)
- `cron` (`/etc/crontabs/root` auto-update path)

### 可选/模式相关依赖

- `kmod-tun` (or equivalent tun support) when using TUN-related modes; runtime checks `tun.ko`/`/etc/modules.d/30-tun`.
- `ujail` is optional hardening path (`/sbin/ujail` existence-gated).
- `ca-certificates`-style trust store is required in practice for HTTPS fetch/validation paths (`wget`/`sing-box` TLS usage).

## 开发备注

### 统计代码行

```bash
cloc . --exclude-dir=sing-box-ref,.git,.cursor,terminals --git --timeout 0 > cloc.md 2>&1 || echo 'CLOC_MISSING' >> cloc.md
```

### Upstream TODO（原始备注）

- Subscription page slow response with a large number of nodes
- Refactor nft rules
- Move ACL settings to a dedicated page
- Any other improvements
