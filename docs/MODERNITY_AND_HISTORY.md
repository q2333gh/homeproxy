# 为何说 HomeProxy「现代」：透明代理发展史与对比

本文回答一个关键问题：**说 HomeProxy 现代，理由是什么？** 通过**透明代理技术演进**和**与同类方案对比**给出依据，而不是空泛的形容词。

---

## 一、透明代理在网关上的技术演进（简史）

这里的「透明」指：终端不装客户端，网关把指定流量转向代理进程，用户无感。演进主线是：**谁做分流决策**、**用什么内核做转发**、**用什么防火墙做劫持**。

### 1. 第一代：iptables REDIRECT + 单协议客户端（约 2012–2016）

- **典型**：Shadowsocks 服务端 + `iptables -j REDIRECT` 把本机 TCP 转到 ss-local；或路由器上跑 ss-redir，用 REDIRECT 把 LAN 的 TCP 转到本地端口。
- **特点**：只做 TCP；UDP 要么不做要么用 TUN/第三方。分流靠 ipset + dnsmasq 写 ipset（gfwlist 等），规则简单。
- **局限**：REDIRECT 改目标 IP/端口，应用看到的是 127.0.0.1，部分程序会异常；内核只认 TCP，UDP 透明代理不统一；iptables 规则一多就难维护。

### 2. 第二代：iptables TPROXY + 多协议（约 2016–2020）

- **典型**：v2ray/xray 的 dokodemo-door（tproxy） + `iptables -j TPROXY`；路由器上 passwall、v2ray 等 LuCI 插件。
- **特点**：TPROXY 不改写目标地址，只改路由，UDP 也能透明走代理；分流用 ipset + 大陆/GFW 列表；协议从 SS 扩展到 VMess、VLESS、Trojan 等。
- **局限**：仍依赖 iptables，规则和链名与具体固件强绑定；v2ray 配置是 JSON，UCI 到 JSON 的生成脚本往往又长又脆；内核 tproxy 模块在不同内核版本上行为不一致。

### 3. 第三代：nftables + 新内核 + 新代理内核（约 2020 至今）

- **防火墙**：OpenWrt 21.02 起推 **firewall4**，底层从 iptables 迁到 **nftables**。nft 一套语法统一 IPv4/IPv6、表/链/集可复用，规则可按文件 include，和 fw4 的「用户配置 + 生成 nft」模型契合。
- **透明方式**：  
  - **redirect**：仍可用，但由 nft 的 redirect 表达。  
  - **tproxy**：需 **kmod-nft-tproxy**，nft 里 `tproxy to :port`，配合策略路由，TCP/UDP 都能透明进用户态。  
  - **TUN**：内核 TUN 设备 + 策略路由，流量进 TUN 后由代理全权处理，可做全栈、多路复用、Bypass 敏感程序等，是「最干净」的透明方式。
- **代理内核**：**sing-box** 出现并成熟（约 2022 起），单二进制、统一配置、支持 VLESS/Reality、Hysteria2、Tuic、Naive、WireGuard 等；维护活跃，和 xray 形成「新一代 vs 上一代」的并存。  
  旧方案多数仍基于 v2ray/xray 或 ss，协议与可维护性不如 sing-box 统一。

### 4. 小结：三代对比

| 代际     | 防火墙/劫持     | 典型代理内核 | 透明方式        | 分流/配置 |
|----------|----------------|-------------|-----------------|------------|
| 第一代   | iptables       | ss-redir 等 | REDIRECT，仅 TCP | ipset + 简单列表 |
| 第二代   | iptables       | v2ray/xray  | TPROXY，TCP+UDP | ipset + UCI→JSON 脚本 |
| 第三代   | nftables (fw4) | sing-box    | redirect + tproxy + TUN | nft set + 规则集/远程规则 |

**「现代」在这里的定义**：站在第三代——用 **nftables（fw4）** 做劫持与分流，用 **sing-box** 做代理内核，支持 **redirect + tproxy + TUN** 三种透明方式，协议上支持 **Reality、Hysteria2、Tuic** 等新协议。HomeProxy 符合这一定义。

---

## 二、与同类方案对比（为何说它现代）

以下均指「在路由器/OpenWrt 上做透明代理」的 LuCI 或类似方案，不讨论纯桌面客户端。

### 2.1 内核与协议栈

| 方案 / 类型        | 代理内核     | 防火墙/劫持   | 透明方式              |
|--------------------|-------------|---------------|------------------------|
| 老一代 passwall 等 | xray/v2ray  | iptables      | redirect / tproxy      |
| OpenClash          | clash (meta)| iptables/nft 混用 | tproxy / TUN（视版本） |
| 部分「师夷长技」类 | xray        | iptables      | tproxy                 |
| **HomeProxy**       | **sing-box**| **nftables (fw4)** | **redirect + tproxy + TUN** |

- **sing-box vs xray/v2ray**：sing-box 设计更统一（一份配置、多入站多出站）、Reality/ECH/Hysteria2/Tuic 等支持更原生，维护节奏快；xray 仍在但新协议往往先出现在 sing-box。
- **nft vs iptables**：nft 是当前 OpenWrt 默认方向，规则可读性和可组合性更好；坚持 iptables 的插件会面临与 fw4 的长期兼容与迁移成本。
- **三种透明方式**：同时支持 redirect、tproxy、TUN 的 LuCI 方案不多；HomeProxy 三种都有，且和 sing-box 官方能力对齐（mixed、redirect、tproxy、tun 入站）。

### 2.2 配置与可维护性

| 维度       | 老一代（如部分 passwall 分支） | HomeProxy |
|------------|--------------------------------|-----------|
| 配置生成   | 大段 shell 拼 JSON             | ucode 生成 JSON，逻辑集中、类型更清晰 |
| 防火墙规则 | 直接写 iptables 或零散 nft     | 用 utpl 模板生成 nft，由 fw4 include，和系统防火墙一致 |
| 升级兼容   | 常有 UCI 结构变更，手改或重配  | 有 migrate_config.uc，显式处理废弃/重命名/块迁移 |
| 运行隔离   | 多数 root 跑到底               | 可选 ujail + capabilities 跑 sing-box |

所以「现代」还体现在：**配置层用 ucode 而非纯 shell、防火墙与 fw4 一体化、有迁移脚本、有安全隔离选项**。

#### 为何选 ucode？第一性原理

**任务本质**：从 UCI 读配置 → 做大量条件分支与结构组合 → 输出**合法 JSON**（sing-box）和**合法 nft**（防火墙）。需要的是：结构化数据、键值/数组嵌套、字符串安全、UCI/ubus 调用、写文件；最好还能和现有系统「同栈」，少依赖、好维护。

**可选方案与短板**：

| 方案 | 优点 | 短板（第一性） |
|------|------|----------------|
| **纯 shell** | 无需额外运行时，OpenWrt 必有 | 没有原生「对象/数组」，拼 JSON 靠 echo/printf，引号与转义极易出错；嵌套一深就难读难改；大段逻辑难以测试。 |
| **Lua** | 有类型、有表结构，LuCI 前端在用 | fw4 的 nft 生成是 **utpl（ucode 模板）**，和 Lua 不是同一套。若 JSON 用 Lua、nft 用 utpl，就变成两门语言、两套调用；且 Lua 在 OpenWrt 上主要服务 LuCI，和 init/防火墙生成管线不统一。 |
| **Python/Go** | 从通用 CS 角度「最舒服」 | 多数 OpenWrt 镜像不默认带 Python/Go，或体积/依赖不理想；和 UCI/fw4 的集成也不是系统原生，属于「额外一层」。 |
| **ucode** | 与 fw4 同栈：fw4 用 ucode + utpl 生成 nft；有 `uci`、`ubus`、`fs` 等模块；类 JS 语法，原生支持对象/数组、`sprintf('%.J', obj)` 直接出 JSON；utpl 本身就是 ucode 模板，**同一门语言既生成 JSON 又生成 nft** | 非通用语言，生态在 OpenWrt 内；但对「在固件里生成配置」这一单一目标足够。 |

**第一性上「最好」是什么**：在**不引入额外运行时、与系统防火墙和配置管线一致**的前提下，用一门**有结构化数据、能安全输出 JSON、能写 nft 模板、能直接读 UCI/ubus** 的语言。  
在当前 OpenWrt 里，满足这些的是 **ucode**：JSON 生成用 ucode（`generate_client.uc`），nft 生成用 utpl（ucode 模板，`firewall_post.ut`），一份依赖、一套语法、和 fw4 官方用法一致。所以 HomeProxy 选 ucode，不是「跟风」，而是**在给定平台约束下，第一性推出来的最优选**——既要正确拼出复杂 JSON 与 nft，又要和 fw4 一体化、可维护，ucode 是唯一同时满足的选项。

### 2.3 协议与订阅

- **协议**：Reality、Hysteria2、Tuic、Naive、WireGuard、VLESS、VMess、Trojan、SS 等，HomeProxy 的订阅解析与节点类型都支持；很多老插件仍以 VMess/Trojan/SS 为主，Reality/Hysteria2 支持晚或残缺。
- **订阅**：支持多种 URI、SIP008、Base64 列表；有黑名单/白名单过滤、去重、主节点失效自动回退；与「只解析一种格式、没有回退」的早期实现比，更完整。

---

## 三、整体脉络：一句话归纳

- **发展史**：从「iptables REDIRECT + SS」到「iptables TPROXY + v2ray/xray」再到「nftables + sing-box + redirect/tproxy/TUN」。
- **对比**：HomeProxy 选的是第三代技术栈（nft、sing-box、三种透明方式），配置与迁移、协议与订阅、安全隔离都按当前一代的常见做法来做。
- **「现代」的理由**：  
  1）**时代**：站在第三代透明代理（nft + sing-box）。  
  2）**对比**：在 OpenWrt 同类里，内核更新（sing-box）、防火墙更新（fw4/nft）、透明方式更全、协议更新（Reality/Hysteria2 等）、配置与迁移更规范。  
  3）**边界**：UI 仍是传统 LuCI，nft 规则尚待重构，所以是「底层现代」，不是「处处领先」。

这样回答「关键问题」：**说它现代，是因为它在透明代理发展史里属于第三代，并且在同代、同类方案里在内核、防火墙、透明方式、协议和可维护性上处于较新、较完整的一侧；有对比、有历史，而不是主观感觉。**
