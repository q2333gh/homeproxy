# HomeProxy 运行前置要求

在全新的官方 OpenWrt ARM64 机器上运行 HomeProxy 前，需满足以下条件。

---

## 一、系统与架构

| 项目 | 要求 |
|------|------|
| 系统版本 | OpenWrt 23.05+ |
| 芯片架构 | ARM64 / AMD64 |
| 防火墙 | 仅支持 **firewall4**（OpenWrt 23.05 起默认） |

> OpenWrt 22.03 使用 iptables/firewall3，不支持 HomeProxy。

---

## 二、必需软件包

### 2.1 HomeProxy 直接依赖（来自 luci-app-homeproxy Makefile）

| 包名 | 用途 |
|------|------|
| `sing-box` | 代理核心 |
| `firewall4` | 防火墙规则（nftables） |
| `kmod-nft-tproxy` | nftables 透明代理内核模块 |
| `ucode-mod-digest` | ucode 摘要/哈希（脚本与 RPC 用） |

### 2.2 sing-box 依赖

| 包名 | 用途 |
|------|------|
| `ca-bundle` | 根证书，用于 TLS 校验 |
| `kmod-inet-diag` | 网络诊断内核模块 |
| `kmod-tun` | TUN 虚拟网卡，支持 TUN 出站 |

### 2.3 运行期依赖（由 init 脚本与 ucode 使用）

| 包名 | 用途 |
|------|------|
| `dnsmasq` | DNS 劫持/转发（init 脚本操作 dhcp.@dnsmasq） |
| `rpcd` | ubus RPC，提供 `luci.homeproxy` |
| `ucode` | ucode 脚本（generate_client.uc、update_subscriptions.uc 等） |
| `luci-base` | LuCI 基础（若使用 Web 界面） |
| `uhttpd` | Web 服务（LuCI 用） |

`procd`、`uci`、`ubus` 为 OpenWrt 核心组件，默认存在。

---

## 三、一键安装依赖（参考）

在已联网的 OpenWrt 上，安装依赖示例：

```bash
opkg update
opkg install sing-box firewall4 kmod-nft-tproxy ucode-mod-digest \
  ca-bundle kmod-inet-diag kmod-tun dnsmasq rpcd ucode \
  luci-base uhttpd
```

> 若软件源包含 `luci-app-homeproxy`，可直接安装并会自动拉取上述依赖；否则需自行构建或安装兼容 IPK。

---

## 四、硬件建议

| 项目 | 建议 |
|------|------|
| 内存 | ≥ 128 MB（建议 256 MB） |
| 存储 | > 16 MB |

---

## 五、来源说明

- **sing-box**：官方 OpenWrt 23.05 已有 `net/sing-box` 包
- **luci-app-homeproxy**：需从软件源安装或自行构建/安装兼容 IPK
- **firewall4**：OpenWrt 23.05 起默认使用

---

## 六、重要: 仅用户可以提供,agent无法帮助:用户需提供
TODO: 高优先级: 减少必要提供,要准备默认规则集 dns 分流策略;第一性原理只需要用户提供订阅或者节点,其余全自动.

运行透明代理前，用户需要准备：

| 项目 | 说明 |
|------|------|
| 代理节点来源 | **订阅链接**（机场订阅 URL）或**手动节点**（协议、地址、端口、密钥等） |
| 节点信息 | 协议类型、服务器地址、端口、密码 / UUID / TLS 参数（视协议而定） |
| 规则集（可选） | 远程规则集 URL 或本地 JSON 路径；内置规则集可直接使用 |
| DNS 服务器（可选） | DoH/DoT 地址，如 `tls://dns.google`、`https://dns.icloud.com/dns-query`；不填则用默认 |
| 分流策略 | 路由模式（如绕过大陆、自定义）、默认出站（直连 / 代理 / 封锁）、路由规则 |

详见 [setup-transparent-proxy.md](setup-transparent-proxy.md) 及 [homeproxy_user_wizard_example](../homeproxy_user_wizard_examaple_from_web_scrap.md)（示例教程）。
