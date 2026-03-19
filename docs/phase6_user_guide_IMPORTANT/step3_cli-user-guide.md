# 纯 Go CLI 配置 HomeProxy

本文档说明如何仅通过 `homeproxy` Go CLI 配置 HomeProxy，无需 LuCI Web 界面。完整命令参考由 `homeproxy docs --out docs/CLI_REFERENCE.md` 生成（from-first-src），见 [cli-go/docs/CLI_REFERENCE.md](../../cli-go/docs/CLI_REFERENCE.md)。

---

## 一、前置条件

- 已满足 [step1_prereq.md](step1_prereq.md) 的系统与软件包要求
- HomeProxy（`luci-app-homeproxy`）已安装
- Go CLI 已构建并可用：`go build -o bin/homeproxy ./cmd/homeproxy`，并将 `bin/homeproxy` 复制到 `PATH`（如 `/usr/bin/`）

> CLI 通过 UCI、init.d、ubus 与 HomeProxy 交互，与 LuCI Web 使用同一套底层接口。

---

## 二、配置流程（CLI 版）

| 步骤 | CLI 命令 | 说明 |
|------|----------|------|
| 1. 添加节点 | 订阅 或 手动 | `subscription add` / `node add` / `node import` |
| 2. 拉取节点 | `subscription update` | 订阅方式需执行一次 |
| 3. 设置主节点 | `node set-main <name>` | 指定主代理节点 |
| 4. 设置路由模式 | `routing set <mode>` | 如 `bypass_mainland_china`、`proxy_all` |
| 5. 设置 DNS | `dns set` / `dns set-china` | 建议配合 `dns cache disable` |
| 6. 启动服务 | `control start` | 启动 HomeProxy |

---

## 二点五、健康检查自动停机

如果你已经在 LuCI 状态页启用了 `Auto shutdown on Google failure`：

- HomeProxy 会使用与 LuCI `Google` 检测相同的探针：
  `wget --spider -qT3 https://www.google.com`
- 单轮失败判定为：
  首次失败后，再按 `2s -> 4s -> 8s` 退避重试，四次都失败才算 1 轮失败
- 连续 `3` 轮失败后，HomeProxy 会执行完整 `stop`
- 该动作会撤销代理、DNS 接管、防火墙规则和路由接管
- 相关日志在：
  `/var/run/homeproxy/homeproxy.log`

> 该监控器由 `/etc/init.d/homeproxy` 自动拉起，内部入口为 `homeproxy health-monitor`，正常情况下不需要手工调用。

---

## 三、命令速查（基于 CLI_REFERENCE）

### node

| Action | Description |
|--------|-------------|
| list | List all nodes |
| test [name] | Test node connection |
| set-main &lt;name&gt; | Set main node |
| add &lt;type&gt; &lt;addr&gt; &lt;port&gt; [label] | Add new node |
| remove &lt;name&gt; | Remove node |
| edit &lt;name&gt; &lt;key&gt; &lt;value&gt; | Edit node |
| import &lt;url&gt; | Import from URL |
| export [name] | Export nodes |

### routing

| Action | Description |
|--------|-------------|
| get | Get current routing mode |
| set &lt;mode&gt; | Set routing mode |
| set-node &lt;type&gt; &lt;name&gt; | Set routing node |
| rules | Show routing rules |
| status | Show routing status |

### dns

| Action | Description |
|--------|-------------|
| get | Get DNS servers |
| set &lt;server&gt; | Set DNS server |
| set-china &lt;server&gt; | Set China DNS server |
| test [domain] | Test DNS resolution |
| cache &lt;enable\|disable&gt; | DNS cache control |
| strategy [mode] | DNS strategy |
| status | Show DNS status |

### subscription

| Action | Description |
|--------|-------------|
| list | List subscriptions |
| add &lt;url&gt; | Add subscription |
| remove [url] | Remove subscription(s) |
| update | Update subscriptions |
| auto-update &lt;on\|off&gt; | Toggle auto-update |
| filter &lt;action&gt; | Manage filter keywords |
| status | Show subscription status |

### control

| Action | Description |
|--------|-------------|
| start | Start HomeProxy |
| stop | Stop HomeProxy |
| restart | Restart HomeProxy |
| status | Show service status |

### 其他命令

| Command | 用途 |
|---------|------|
| status | Show HomeProxy status |
| log [type], log clean [type] | Show or clear logs |
| features | Show sing-box features |
| resources version [type], update &lt;type&gt; | Resource management |
| acl list &lt;type&gt;, write &lt;type&gt; --file &lt;path&gt; | ACL list management |
| cert write &lt;filename&gt; --file &lt;path&gt; | Write certificate |
| generator &lt;type&gt; [params] | Generate keys |
| completion bash | Output bash completion script |
| docs [--out &lt;file&gt;] | Generate Markdown reference |

> 完整参考见 `homeproxy docs` 或 [CLI_REFERENCE.md](../../cli-go/docs/CLI_REFERENCE.md)。

---

## 四、配置示例

**订阅 + 绕过大陆透明代理：**

```bash
# 1. 添加订阅并拉取
homeproxy subscription add https://your-subscription-url
homeproxy subscription update

# 2. 设置主节点
homeproxy node list
homeproxy node set-main <节点名或ID>

# 3. 路由与 DNS
homeproxy routing set bypass_mainland_china
homeproxy dns set tls://dns.google
homeproxy dns set-china 223.5.5.5
homeproxy dns cache disable

# 4. 启动
homeproxy control start

# 5. 检查
homeproxy status
homeproxy node test <节点名>
```

**手动添加节点（需 edit 补充协议参数）：**

```bash
# 支持类型：vmess, vless, trojan, shadowsocks, hysteria, hysteria2, socks, http, tuic, wireguard, direct
homeproxy node add vmess 1.2.3.4 443 my-node
homeproxy node edit my-node uuid xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
homeproxy node edit my-node alterId 0
```

---

## 五、CLI 覆盖与限制

| 能力 | CLI 支持 | 说明 |
|------|----------|------|
| 节点（订阅/手动/编辑） | ✅ | 完整支持 |
| 路由模式（bypass/proxy_all 等） | ✅ | 支持 |
| 主节点 / UDP 节点 | ✅ | 支持 |
| DNS 服务器（简单地址） | ✅ | `dns set` / `dns set-china` |
| 规则集（远程/本地） | ❌ | 需 UCI 或 LuCI |
| 路由规则（custom 模式） | ❌ | 需 UCI 或 LuCI |
| 路由节点（custom 模式） | 部分 | `routing set-node` 可设 main/udp |
| ACL / cert / generator / resources | ✅ | 支持 |
| docs / completion | ✅ | 支持 |

如需自定义规则集、复杂路由规则，请用 UCI 编辑 `/etc/config/homeproxy` 或 LuCI Web。详细配置见 [z_web_wizard_examaple_from_web_scrap.md](z_web_wizard_examaple_from_web_scrap.md)。
