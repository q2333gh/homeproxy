# HomeProxy 原理说明

本文档描述 **luci-app-homeproxy** 在 OpenWrt 上做了什么事情：功能、数据流与架构。不涉及具体编程语法，只关注“做了什么”。

---

## 1. 项目定位

- **是什么**：面向 路由器的openwrt系统 的 LuCI 应用，提供“家庭代理平台(透明代理)”的实现.


- **核心依赖**：底层代理由 **sing-box** 执行；网络策略由 **firewall4** + **nftables** + **kmod-nft-tproxy** 实现；配置生成与脚本使用 **ucode**。
- **典型用途**：在路由器上作为透明代理客户端（可选服务端），实现按规则分流（如绕过大陆、GFW 列表、全局代理、自定义规则等）。

---



---

已阅读项目代码并写好原理文档，路径：**`docs/PRINCIPLE.md`**。

文档只讲「做了什么事」，不涉及 JS/ucode 等语法细节，结构如下：

1. **项目定位**：OpenWrt/ImmortalWrt 上的 LuCI 代理平台，基于 sing-box + firewall4 + nftables。
2. **整体架构**：LuCI → UCI → init 脚本 → 生成 sing-box 配置与 nft 规则 → 跑 sing-box 客户端/服务端并加载防火墙。
3. **UCI 配置模型**：infra、config、control、routing、dns、subscription、server、node 等各自负责的配置与用途。(uci 概念: OpenWrt 的统一配置存储与读写接口 )
4. **init 启动流程**：生成并校验客户端配置、配置 cron 订阅、写 DNSMasq、设路由/TUN、起 sing-box、写防火墙、日志清理等步骤。
5. **generate_client.uc**：从 UCI 生成完整 sing-box 客户端 JSON（DNS、入站、出站、路由、规则集等）。
6. **generate_server.uc**：从 UCI server 段生成服务端 JSON（仅 log + inbounds）。
7. **防火墙**：firewall_pre 放行 TUN/server 端口；firewall_post 生成 nft（地址集、DNS 劫持、TCP 重定向、UDP tproxy、TUN mark、分流与 ACL）。
8. **订阅与资源**：订阅解析与 UCI 节点增删改、主节点回退；china_ip4/ip6、gfw_list、china_list 的拉取与版本管理；update_crond 串联资源与订阅。
9. **迁移与默认**：migrate_config.uc 做 UCI 兼容迁移；uci-defaults 把 fw4 的 include 指到 homeproxy 生成的 nft 文件。
10. **LuCI/RPC**：菜单与 acllist、证书、连通性测试、日志清理、sing-box 生成器、特性检测、资源版本与更新等接口。
11. **数据流小结**：DNS 与 TCP/UDP 如何被劫持/重定向到 sing-box，以及按规则直连或走代理。
12. **安全与权限**：ujail、capabilities、证书存放与订阅更新方式。

若你希望把某一块再展开（例如只写「防火墙」或「订阅」），可以指定章节或文件名，我按那一块再细化一版。
---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│  LuCI Web 界面 (status / client / node / server 等页面)          │
│  → 通过 RPC (luci.homeproxy) 读写 UCI、触发脚本、查状态           │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  UCI 配置 (/etc/config/homeproxy)                               │
│  infra / config / control / routing / dns / subscription /      │
│  server / node / routing_node / routing_rule / dns_server /      │
│  dns_rule / ruleset 等                                          │
└───────────────────────────────┬─────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────┐
│  init.d/homeproxy (启停与编排)                                   │
│  · 读 UCI → 调 ucode 生成 sing-box 配置与防火墙片段              │
│  · 配置 DNSMasq、路由表、cron、procd 进程                        │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ sing-box 客户端│     │ sing-box 服务端  │     │ firewall4       │
│ (可选)        │     │ (可选)           │     │ (nft 规则)      │
│ sing-box-c    │     │ sing-box-s       │     │ fw4_*.nft       │
└───────────────┘     └─────────────────┘     └─────────────────┘
```

- **配置来源**：用户通过 LuCI 或 UCI 修改 `homeproxy`；启停时由 init 脚本驱动“UCI → sing-box JSON + nft 规则”。
- **运行目录**：`/var/run/homeproxy` 存放生成的 `sing-box-c.json`、`sing-box-s.json`、日志及防火墙片段；`/etc/homeproxy` 存放脚本、资源列表、证书等。

---


## 3. 配置模型（UCI）在做什么

- **infra**：内部/基础设施参数，不建议手改。包括各监听端口（mixed、redirect、tproxy、dns、common_port）、TUN 设备名与网段、mark、DNS 劫持开关、NTP、sniff 等。
- **config**：主业务配置。选择主节点 / 主 UDP 节点、DNS 服务器、大陆 DNS、分流模式（绕过大陆 / GFW 列表 / 代理大陆 / 全局 / 自定义）、代理模式（redirect、tproxy、tun 等）、路由端口、是否 IPv6、日志级别、GitHub Token 等。
- **control**：流量控制与 ACL。例如：监听接口、LAN 代理模式（关闭 / 仅列表 / 排除列表）、直连/代理/游戏模式/全局代理的 MAC 或 IP 列表、WAN 侧“走代理”或“直连”的 IP 段等。
- **routing**（自定义模式）：默认出站、默认 DNS 出站、域名策略、sniff、UDP 超时、TUN 相关、是否绕过大陆流量等。
- **dns**：自定义模式下的 DNS 策略、默认服务器、缓存、client_subnet、规则等。
- **subscription**：订阅 URL、自动更新、允许不安全、包编码、是否经代理更新、节点过滤（黑名单/白名单及关键词）等。
- **server**：是否启用服务端、各入站（类型、端口、TLS、传输、认证等）、日志级别。
- **node**：代理节点（手动添加或订阅解析得到），类型包括 VLESS、VMess、Trojan、Hysteria、Tuic、Shadowsocks、WireGuard 等，对应 sing-box 的 outbound/endpoint。
- **routing_node / routing_rule / dns_server / dns_rule / ruleset**：自定义模式下的出站、路由规则、DNS 服务器与规则、远程规则集等。

整体上，UCI 负责“用户意图”；脚本负责把意图转成 sing-box 与防火墙能执行的配置。

---

## 4. 启动时 init 脚本做了哪些事

`/etc/init.d/homeproxy` 的 `start_service` 大致顺序如下（只列“做了什么事”）：

1. **条件判断**  
   若未选主节点且未启用 server，则直接返回（不启动）。

2. **客户端配置生成与校验**  
   - 调用 `generate_client.uc`，根据 UCI 生成 `sing-box-c.json`。  
   - 若生成失败或 `sing-box check` 不通过，记录错误并返回。

3. **订阅自动更新（cron）**  
   若开启订阅自动更新，则往 root 的 crontab 写入定时任务（默认每天一次），执行 `update_crond.sh`，到点会更新资源列表并拉取订阅。

4. **DNS 与 DNSMasq**  
   - 按分流模式写 dnsmasq 配置：  
     - 绕过大陆 / 自定义 / 全局：本机 DNS 端口作为上游（no-resolv + server 127.0.0.1#dns_port）。  
     - GFW 列表：按 gfw_list 生成“域名 → 本机 DNS + nft set（gfw_list_v4/v6）”的配置。  
     - 代理大陆：按 china_list 生成“域名 → 本机 DNS”。  
   - 若有 proxy_list，再写一份“域名 → 本机 DNS + 写入 wan_proxy nft set”的配置。  
   - 重启 dnsmasq 使配置生效。

5. **路由表与 TUN（按代理模式）**  
   - **redirect + tproxy**：写策略路由，使带 tproxy_mark 的流量查 table_mark，路由到 local 的 redirect/tproxy 端口。  
   - **tun**：创建 TUN 设备，设置地址与路由，使带 tun_mark 的流量走 TUN。

6. **启动 sing-box 客户端**  
   - 用 procd 以 `sing-box run --config sing-box-c.json` 跑客户端；可选 ujail 限制权限、capabilities、用户等。  
   - 若启用 server，再生成 `sing-box-s.json` 并同样用 procd 启动服务端进程。

7. **日志清理进程**  
   启动一个常驻的 `clean_log.sh`，定期检查日志文件大小，超过约 50KB 即清空，避免占满存储。

8. **防火墙**  
   - 先执行 `firewall_pre.uc`，根据 TUN 与 server 的入站写 `fw4_forward.nft`、`fw4_input.nft`（放行 TUN 与已开启 firewall 的 server 端口）。  
   - 再执行 `firewall_post.ut` 生成 `fw4_post.nft`。  
   - 最后 `fw4 reload` 加载这些 nft 片段（通过 uci-defaults 里配置的 firewall include 引入）。

9. **收尾**  
   按模式准备 cache.db（绕过大陆）或 ruleset 目录（自定义）；清空/创建日志；为 ujail 调整 RUN_DIR 权限。

停止时：删 cron 任务、删策略路由与 TUN 路由、清空并删除 homeproxy 相关的 nft chain/set、移除 DNSMasq 的 homeproxy 配置并重启 dnsmasq、删除生成的 JSON、若为 TUN 模式则删除 TUN 设备。

---

## 5. 客户端配置生成（generate_client.uc）在做什么

- **输入**：UCI 中 infra、config、control、routing、dns、node、routing_node、routing_rule、dns_server、dns_rule、ruleset 等。
- **输出**：一份完整的 sing-box 客户端 JSON，写入 `/var/run/homeproxy/sing-box-c.json`。

主要逻辑概括：

- **日志 / NTP**：按 UCI 设置 log 与 NTP。
- **DNS**：  
  - 非自定义：默认 DNS、system DNS、主 DNS（经主节点）、大陆模式下的 china-dns；规则里包含直连域名列表、代理域名列表、geosite/geoip 规则等。  
  - 自定义：按 dns_server / dns_rule 生成 servers 与 rules，final 指向配置的 default_server。
- **入站（inbounds）**：  
  - 固定：DNS（dns_port）、Mixed（mixed_port）。  
  - 按 proxy_mode：redirect 时加 redirect 入站；tproxy 时加 tproxy 入站（UDP）；tun 时加 TUN 入站。  
  端口、sniff、udp_timeout 等均来自 infra/config。
- **出站（outbounds/endpoints）**：  
  - 固定：direct、block。  
  - 主节点（或 urltest 聚合）、主 UDP 节点（可单独指定或 same）；自定义模式下按 routing_node 生成多出站及 urltest。  
  - 每个节点对应一种协议（VLESS、VMess、Trojan、Hysteria、Tuic、Shadowsocks、WireGuard 等），字段映射到 sing-box 的 server、port、tls、transport、multiplex 等。
- **路由（route）**：  
  - 默认：hijack-dns；可选 default_interface / auto_detect_interface。  
  - 非自定义：直连域名、主 UDP 出站、main-out 为 final；规则集包括 direct/proxy 域名、绕过大陆时的 geoip-cn、geosite-cn、geosite-noncn 等。  
  - 自定义：按 routing_rule 与 ruleset 生成规则，final 为 default_outbound。
- **实验特性**：绕过大陆/自定义时可选开启 cache_file（cache.db），用于规则集缓存。

不写空字段，最终用 `removeBlankAttrs` 后输出 JSON。

---

## 6. 服务端配置生成（generate_server.uc）在做什么

- **输入**：UCI 中 server 段，每段一个入站（类型、端口、地址、TLS、传输、用户/认证等）。
- **输出**：`/var/run/homeproxy/sing-box-s.json`。

只包含 log 与 inbounds；每个启用的 server 条目对应一个 listen 入站（支持多种协议与 TLS/ACME/Reality 等）。无路由、无出站。

---

## 7. 防火墙在做什么（firewall_pre.uc + firewall_post.ut）

- **firewall_pre.uc**：  
  - 若启用 TUN，在 forward/input 中放行 TUN 接口。  
  - 若启用 server，对每个开启 `firewall` 的 server 入站，在 input 中放行对应协议和端口。  
  结果写入 `fw4_forward.nft`、`fw4_input.nft`。

- **firewall_post.ut**：  
  生成完整的“homeproxy 策略”nft 片段（`fw4_post.nft`），被 firewall4 在 table-post 阶段 include。主要做几类事：  
  - **地址集**：本机保留地址、GFW 列表/大陆 IP/大陆域名、WAN 代理/直连 ACL、路由端口集合。  
  - **DNS 劫持**：在未启用 dnsmasq 自身 redirect 时，将 53 端口的 UDP 重定向到 dnsmasq 端口，实现 LAN DNS 走路由器。  
  - **TCP 重定向（redirect 模式）**：  
    - 按 control 的 listen_interfaces、lan_proxy_mode、lan_*_ips/mac、wan_proxy/wan_direct 等，决定哪些流量要进 homeproxy。  
    - 命中“走代理”的 TCP 重定向到 redirect_port（交给 sing-box redirect 入站）。  
    - 本机/直连/WAN 直连、大陆或 GFW 等按分流模式区分；游戏模式设备可走 redirect 而不限端口。  
  - **UDP tproxy（tproxy 模式）**：同样按 LAN/WAN ACL 与分流模式，对 UDP 打 mark 并 tproxy 到 tproxy_port；本机与直连段不代理。  
  - **TUN 模式**：对需走代理的 TCP/UDP 打 tun_mark，经策略路由进 TUN。  
  - 在 gfwlist/绕过大陆等模式下，对部分 UDP 80/443 做 reject，避免未代理的 QUIC 直连。

整体效果：透明地把 LAN 内指定设备、指定目标的 TCP/UDP 交给 sing-box 处理，或经 TUN 出站，其余直连。

---

## 8. 订阅与资源更新在做什么

- **update_subscriptions.uc**：  
  - 若未选“经代理更新”，先停 homeproxy。  
  - 对每个订阅 URL 用 wget 拉取内容；支持 JSON（含 servers 或 SIP008）或 Base64 多行链接。  
  - 逐行/逐条解析为节点（支持 VLESS、VMess、Trojan、Hysteria、Tuic、Shadowsocks、HTTP/SOCKS 等 URI）；校验 host/port；按订阅配置做黑名单/白名单过滤、去重。  
  - 与现有 UCI node 对比：订阅中已删除的节点从 UCI 删掉；新增的写入 UCI；已有节点更新属性。  
  - 若当前主节点/主 UDP 节点被删，则自动切到第一个可用节点或清空主节点。  
  - 写 UCI commit；若需要则重启 homeproxy。  
  - 日志写到 `homeproxy.log`。

- **update_resources.sh**：  
  参数为 `china_ip4`、`china_ip6`、`gfw_list`、`china_list` 之一。  
  - 用 GitHub API（可选 Token）查对应仓库/路径的最新 commit 与版本号。  
  - 若本地版本已最新则跳过；否则从 jsDelivr 拉取对应文件，写入 `/etc/homeproxy/resources/<类型>.<后缀>`，并更新 `.ver` 版本文件。  
  - 用于大陆 IP、GFW 域名、直连域名等列表的更新。

- **update_crond.sh**：  
  按顺序执行：china_ip4、china_ip6、gfw_list、china_list 的资源更新，然后执行 `update_subscriptions.uc`。通常由 cron 在每日指定时间调用。

---

## 9. 迁移与默认配置（migrate_config.uc + uci-defaults）

- **migrate_config.uc**：  
  在升级后做 UCI 兼容性迁移，例如：删除废弃选项（china_dns_port、tun_gso、experimental、各节点上的废弃字段）；移动选项（如 github_token 到 config）；合并/拆分字段（china_dns_server、routing_port）；DNS server 从“地址”改为 type+server+port+path；block-dns/block-out 改为 action reject；rule_set_ipcidr_match_source 更名；server 的 auto_firewall 下放到每条 server 的 firewall 等。保证旧配置在新版本下仍可用。

- **uci-defaults（luci-homeproxy）**：  
  在首次安装/升级时，配置 firewall4：  
  - 删除旧的 homeproxy_pre/forward/input/post 条目。  
  - 新增三个 include：`fw4_forward.nft`（forward chain）、`fw4_input.nft`（input chain）、`fw4_post.nft`（table-post）。  
  这样 fw4 reload 时会自动加载 homeproxy 生成的 nft 片段。

---

## 10. LuCI 与 RPC 在做什么

- **菜单**：在“服务”下挂“HomeProxy”，子菜单包括：Client Settings、Node Settings、Server Settings、Service Status。  
- **RPC（luci.homeproxy）**：  
  - **acllist_read / acllist_write**：读/写 direct_list、proxy_list 文本。  
  - **certificate_write**：上传并校验 PEM，写入 `homeproxy/certs`（client_ca、server 公钥/私钥）。  
  - **connection_check**：用 wget 测百度/谷歌连通性，返回是否成功。  
  - **log_clean**：清空指定类型日志（homeproxy、sing-box-c、sing-box-s）。  
  - **singbox_generator**：调用 sing-box 生成 ECH 密钥对、UUID、Reality/VAPID/WireGuard 密钥对等。  
  - **singbox_get_features**：读 sing-box 版本与 Tags，并检测内核模块（tproxy、tun）、ip-full、brutal 等，供前端显示能力。  
  - **resources_get_version / resources_update**：查资源文件版本、触发 update_resources.sh 更新指定类型。

前端（status/client/node/server 等）通过 RPC 与 UCI 完成：节点与订阅管理、客户端/服务端/控制面配置、连通性测试、日志查看、证书与密钥生成、资源更新等，不直接执行 shell，而是通过 rpcd 调用上述方法。

---

## 11. 数据流小结（透明代理场景）

1. **LAN 设备发起到外网的连接**  
   - 若未开 DNS 劫持，DNS 可能先到路由器 53；若开了劫持，53 被重定向到 dnsmasq，再按配置转 127.0.0.1#dns_port 进 sing-box。  
   - sing-box 的 DNS 入站根据规则（直连/代理域名、geoip/geosite 等）解析，并可能写入 nft set（gfw_list/wan_proxy 等）供后续流量匹配。

2. **TCP 连接**  
   - 命中 firewall_post 中“走代理”的 TCP（按 LAN/WAN ACL、分流模式、端口等）被重定向到 redirect_port。  
   - sing-box redirect 入站接收后，根据路由规则选择出站（直连或某个代理节点），完成连接。

3. **UDP**  
   - 命中 tproxy 规则的 UDP 被 nft tproxy 到 tproxy_port，或（TUN 模式）打 mark 进 TUN。  
   - sing-box 的 tproxy 入站或 TUN 入站收到后，同样按路由规则选出站。

4. **出站**  
   - 直连：direct-out。  
   - 代理：对应 node 的 outbound（VLESS/VMess/Trojan/Hysteria 等）经远程服务器出去。

整体上，用户只需在 LuCI 里选节点、选分流模式、可选调 ACL，其余“谁走代理、谁直连、DNS 怎么查”都由 UCI + 脚本 + sing-box + nft 自动完成。

---

## 12. 安全与权限

- sing-box 进程可选在 ujail 中运行，限制挂载与 capabilities；使用 `homeproxy.json` 中的 capability 集（如 CAP_NET_ADMIN、CAP_NET_RAW 等）。  
- 证书与密钥存放在 `/etc/homeproxy/certs/`，由 RPC 校验 PEM 格式后写入。  
- 订阅与资源更新可用 GitHub Token 避免限流；更新订阅时可选择“经代理”拉取。

---

以上即为 HomeProxy 在 OpenWrt 上的工作原理与行为概览：**UCI 存配置 → init 与脚本生成 sing-box 与 nft → sing-box 做代理与 DNS → firewall4 做透明劫持与分流**，LuCI 与 RPC 负责配置与运维界面。
