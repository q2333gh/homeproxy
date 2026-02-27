## HomeProxy 状态变化过程（从配置到运行）

本文件结合：

- `HomeProxy状态模型与运行时文件布局.md` 中的运行时状态与存储位置
- Web 向导配置顺序（`z_web_wizard_examaple.md` 第 213–376 行）

按“从零到可用”的时间顺序，描述 HomeProxy 内部状态如何一步步变化。所有描述均以本仓库源码为唯一事实来源，只用自然语言，不贴源码。

---

## 1. 初始状态：已安装，但未真正运行

前提：ipk 安装完成，系统中已经存在：

- UCI 配置：`/etc/config/homeproxy`（包含 `infra` / `config` / `dns` / `subscription` / `server` 等段，有默认值）
- 工作目录：`/etc/homeproxy`（脚本、资源目录、证书目录等）
- init 脚本：`/etc/init.d/homeproxy`
- UBUS RPC：`luci.homeproxy`（通过 `/usr/share/rpcd/ucode/luci.homeproxy` 注册）

此时的典型状态：

- `/etc/config/homeproxy`：有默认配置，但 `config.main_node` 通常为 `nil`，`server.enabled` 为 `0`。
- `/var/run/homeproxy`：还不存在或为空（没有 `sing-box-*.json`、`*.log`、`cache.db`）。
- procd 中没有 `sing-box-c` / `sing-box-s` 实例在跑。

即：**“安装完成”≠“真正开始代理流量”，还处于未启用状态。**

---

## 2. 第一步：添加代理节点 —— 填充“可用出站”的静态状态

对应 Web 流程：

- 路径：**节点设置**
- 方式：订阅添加 / 手动添加 / 导入分享链接

内部状态变化（主要是持久层，不触发运行时）：

- **UCI `node` 段增加/修改**
  - 每个节点对应一个 `homeproxy` 下的 `node` 段，包含协议、地址、端口、密码/UUID、传输参数等。
  - 若使用订阅，订阅脚本会：
    - 读取订阅 URL
    - 解析出多个节点
    - 为每个节点写入/更新一个 UCI `node` 段
- 如使用“直连”出站，必须存在至少一个类型为“直连”的节点，否则后面路由配置会导致无法启用服务。

此阶段：

- `/etc/config/homeproxy` 中的节点信息变多、变全。
- `/etc/homeproxy` / `/var/run/homeproxy` 侧还没有明显变化（订阅日志除外）。

**总结：这一步只是“准备原材料”，还没有生成 sing-box 配置，也不会改防火墙。**

---

## 3. 第二步：规则集（可选）—— 为后续路由/DNS 规则准备条件

对应 Web 流程：

- 路径：**客户端设置 → 规则集**

内部状态变化：

- 规则集可以是：
  - 内置（已经随 `resources` 与 `ruleset` 提供）
  - 本地规则集（用户手动放入 `/etc/homeproxy/ruleset/`，并在 UCI 中记录本地路径）
  - 远程规则集（UCI 中记录 URL 与用于下载的出站，实际拉取由 sing-box 在运行时完成，并不一定落盘到 `/etc/homeproxy/ruleset/`）
- UCI 中会记录规则集的来源、格式与路径，用于后续生成 sing-box 配置时引用。

此阶段：

- `/etc/config/homeproxy`：记录“有哪些规则集、怎么用”。
- `/etc/homeproxy/ruleset/`：可能新增/更新本地或远程规则文件。
- 仍然**不会启动 sing-box**，也不直接改路由表或防火墙。

**总结：规则集只是“条件定义库”，为第 3 步路由规则和第 4 步 DNS 规则提供可复用条件。**

---

## 4. 第三步：配置路由 —— 确定“流量怎么走”的目标状态

对应 Web 流程：

- 路径：**客户端设置**
- 顺序：
  1. 路由设置
  2. 路由节点
  3. 路由规则

### 4.1 路由设置 —— 全局策略状态

关键字段（源自 UCI `config` / `routing` 段）：

- 路由模式：选择“自定义”，或者使用预设模式（绕过大陆、GFW 列表、代理大陆、全局）。
- 默认出站：未命中任何规则时的兜底出站（必须是有效出站；若设为“禁用”，启动脚本会视为不可运行）。
- 路由端口 / 代理模式 / IPv6 支持 / 是否绕过中国流量等。

这些设置会在 **启用服务时** 被 `generate_client.uc` 读取并转换为 sing-box 的：

- 默认 outbound
- inbound 端口（mixed/redirect/tproxy/tun）
- 是否启用 TUN、tproxy 等

### 4.2 路由节点 —— 将节点映射为可路由对象

内部状态变化：

- UCI 新增 `routing_node` 段：
  - 每个路由节点指向一个真实的 `node`（或特殊节点如“直连”、“封锁”）。
  - 形成“出站 ID → 实际连接参数”的映射。

这使得后续路由规则可以只引用“路由节点名”，由生成脚本在构造 sing-box JSON 时把它展开为具体 outbound 配置。

### 4.3 路由规则 —— 定义匹配顺序与出站选择

内部状态变化：

- UCI 新增/调整 `routing_rule` 段：
  - 顺序敏感：上方规则优先。
  - 条件：规则集 / IP / 域名 / 端口等。
  - 动作：选用哪个路由节点（如“直连” / “封锁” / 某个代理节点）。

这些规则在 **生成 sing-box 客户端配置时** 会被翻译为 `route.rules` 等字段，决定具体流量分流行为。

此阶段总结：

- `/etc/config/homeproxy`：路由相关段被填满，描述“理想中的分流策略”。
- 运行态仍未变化；**只有在后面的“保存并启动”阶段，这些配置才会真正变成 nft 规则和 sing-box 行为。**

---

## 5. 第四步：配置 DNS —— 确定“域名怎么解析”的目标状态

对应 Web 流程：

- DNS 设置 / DNS 服务器 / DNS 规则

内部状态变化：

- UCI `dns` / `dns_server` / `dns_rule` 等段：
  - 默认 DNS 服务器与解析策略（如优先 IPv4、是否禁用缓存等）。
  - 境内 DNS、境外 DoT/DoH 服务器及其访问方式。
  - 基于规则集/域名的 DNS 分流规则。

这些配置在生成 sing-box 配置时会变成：

- `dns.servers`：各个上游 DNS，包含类型（DoT/DoH/纯 UDP）与出站等。
- `dns.rules`：针对不同域名/规则集使用不同上游 DNS。

**总结：到这一步为止，所有“静态配置状态”都已经写进了 UCI，但系统仍然可能还没开始真正接管流量。**

---

## 6. 第五步：保存并启动 —— 从“静态配置”切换到“运行中状态”

对应 Web 流程：

- 点击“保存并应用”，然后“启动服务”

内部发生的一系列状态变化，可以按顺序理解为：

### 6.1 init 脚本读取 UCI，准备运行目录

- 读取 `/etc/config/homeproxy` 中的：
  - `config.main_node` / `config.main_udp_node`
  - `config.routing_mode` / `config.proxy_mode`
  - `dns.*`、`subscription.*`、`server.enabled` 等
- 若发现没有有效主节点且服务端也未启用，直接返回错误（不进入后续步骤）。
- 创建 `/var/run/homeproxy` 目录作为 `RUN_DIR`。

### 6.2 生成并校验 sing-box 配置

- 根据当前 UCI：
  - 调用 `generate_client.uc` 生成 `RUN_DIR/sing-box-c.json`（客户端）。
  - 若开启 server，则调用 `generate_server.uc` 生成 `RUN_DIR/sing-box-s.json`（服务端）。
- 使用 sing-box 自带的 `check` 子命令校验生成的 JSON：
  - 如校验失败，写入 `homeproxy.log` 并终止启动。

此时：**UCI 静态配置 → sing-box JSON 配置文件** 这条链路已经完成，`RUN_DIR` 中首次出现关键配置文件。

### 6.3 配置 DNSMasq 与防火墙片段

- 基于当前路由模式和资源列表：
  - 为 DNSMasq 生成/更新专用的配置文件，指向 HomeProxy 的 DNS 端口。
  - 对 china_list / gfw_list / proxy_list 做文本处理，生成适配 DNSMasq 与 nft 的规则文件。
- 调用 `firewall_pre.uc` / `firewall_post.ut` 等脚本：
  - 生成 `fw4_forward.nft` / `fw4_input.nft` / `fw4_post.nft` 写入 `RUN_DIR`。
  - reload firewall4，使新规则生效。

此时：**DNS 劫持/分流和 nft 规则已经与当前 UCI 同步**，但 sing-box 进程可能尚未完全拉起。

### 6.4 启动 sing-box 客户端/服务端与日志清理守护

- 通过 procd 启动：
  - `sing-box-c`：加载 `RUN_DIR/sing-box-c.json`，输出日志到 `RUN_DIR/sing-box-c.log`。
  - `sing-box-s`（如开启）：加载 `RUN_DIR/sing-box-s.json`，输出日志到 `RUN_DIR/sing-box-s.log`。
  - `log-cleaner`：执行 `clean_log.sh`，定期检查并截断日志文件，防止无限增长。
- 若系统支持，部分实例在 `ujail` 中运行，挂载所需文件与目录。

同时：

- 初始化/清空相关日志文件：
  - `homeproxy.log` 记录启动过程与版本信息。
  - `sing-box-*.log` 被清空，准备写入新日志。
- 若路由模式启用缓存，确保 `RUN_DIR/cache.db` 存在，并在需要时挂载为可写。

**到这里，HomeProxy 已经从“配置完成”转变为“真正接管流量”的运行状态。**

---

## 7. 运行中：稳定态与后台状态更新

在长期运行过程中，HomeProxy 的状态仍在缓慢变化，主要体现在：

- **流量与路由状态**
  - nft 规则和 `ip rule` / `ip route` 维持透明代理 / TUN 行为。
  - sing-box 按 `sing-box-c.json` / `sing-box-s.json` 和资源列表进行分流。
- **日志与缓存**
  - `homeproxy.log` 持续记录订阅/资源更新、错误、重要事件。
  - `sing-box-*.log` 反映流量与协议层运行情况。
  - `cache.db` 累积缓存数据（在特定路由模式下）。
- **订阅与资源自动更新**
  - 若启用 `subscription.auto_update`，`/etc/crontabs/root` 会存在一行自动任务：
    - 定时运行更新脚本，触发订阅解析与资源拉取。
    - 更新 `/etc/config/homeproxy` 中的节点列表。
    - 刷新 `/etc/homeproxy/resources/*.ver` 与对应名单文件。
    - 全过程写入 `RUN_DIR/homeproxy.log`。

当用户在 LuCI 界面点击“保存并应用”修改配置时，会触发 `reload`：

- 先按 stop 流程清理旧的路由 / nft / 进程等状态。
- 再按 start 流程重新生成 JSON、规则和进程。

**因此：“保存并应用”本质上是一组状态迁移：旧配置 → 中间清理态 → 新配置对应的新运行态。**

---

## 8. 停止 / 重启：状态回收与恢复

当用户停止服务或系统重启时，init 脚本会执行 stop / restart 流程：

- 删除/清空：
  - 路由相关的 `ip rule` / `ip route` / `ip tuntap`。
  - nft 中 HomeProxy 专用的 chains 与 sets，并将 `fw4_*.nft` 清空后 reload。
  - `RUN_DIR` 下的 sing-box JSON、日志文件（视实现而定）。
- 停掉：
  - `sing-box-c` / `sing-box-s` / `log-cleaner` 等 procd 实例。
  - cron 中带 `#homeproxy_autosetup` 的自动任务（如果之前启用过）。

在系统下一次启动，或用户再次点击“启动服务”时，又会从第 6 节描述的 start 流程重新构建运行态。

**总结：**

- **持久层（UCI + `/etc/homeproxy`）记录“期望状态”与静态资源。**
- **运行层（`/var/run/homeproxy` + procd + nft + cron）反映“当前实际执行状态”。**
- Web 向导的配置顺序（节点 → 规则集 → 路由 → DNS → 保存/启动），就是按依赖关系逐步填满“期望状态”，再由 init 脚本和脚本体系把它投射为完整的“运行状态”。 

