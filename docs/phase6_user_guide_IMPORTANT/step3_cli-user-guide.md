# 纯 Go CLI 配置 HomeProxy

本文档说明如何仅通过 `homeproxy` Go CLI 为用户配置 HomeProxy，无需 LuCI Web 界面。

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

## 三、命令详解

### 3.1 节点管理

**订阅方式（推荐）**

```bash
# 添加订阅
homeproxy subscription add https://your-subscription-url

# 拉取节点
homeproxy subscription update

# 查看节点
homeproxy node list
```

**手动添加节点**

```bash
# 添加节点：type address port [label]
# 支持类型：vmess, vless, trojan, shadowsocks, hysteria, hysteria2, socks, http, tuic, wireguard, direct
homeproxy node add vmess 1.2.3.4 443 my-node

# 补充协议参数（如 uuid、password）需用 edit
homeproxy node edit my-node uuid xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
homeproxy node edit my-node alterId 0
```

**设置主节点**

```bash
homeproxy node set-main my-node
```

**测试节点连接**

```bash
homeproxy node test my-node
```

### 3.2 路由设置

```bash
# 查看当前路由
homeproxy routing get
homeproxy routing status

# 设置路由模式
# bypass_mainland_china | proxy_mainland_china | proxy_all | direct_all | custom
homeproxy routing set bypass_mainland_china

# 设置主节点 / UDP 节点（与 node set-main 类似，也可用于 custom 模式的 routing_node）
homeproxy routing set-node main my-node
homeproxy routing set-node udp my-node
```

### 3.3 DNS 设置

```bash
# 查看 DNS
homeproxy dns get
homeproxy dns status

# 设置默认 DNS（国外）
homeproxy dns set tls://dns.google
# 或
homeproxy dns set 8.8.8.8

# 设置中国 DNS
homeproxy dns set-china 223.5.5.5

# 禁用 DNS 缓存（强烈建议）
homeproxy dns cache disable
```

### 3.4 服务控制

```bash
# 启动 / 停止 / 重启
homeproxy control start
homeproxy control stop
homeproxy control restart

# 查看状态
homeproxy status
homeproxy control status
```

### 3.5 订阅管理

```bash
homeproxy subscription list
homeproxy subscription add <url>
homeproxy subscription remove [url]
homeproxy subscription update
homeproxy subscription auto-update on   # 启用自动更新
homeproxy subscription auto-update off
```

### 3.6 日志与资源

```bash
homeproxy log                    # 查看主日志
homeproxy log homeproxy
homeproxy log sing-box-c
homeproxy log clean              # 清空日志

homeproxy resources version      # 查看规则集版本
homeproxy resources update china_ip4   # 更新规则集
```

---

## 四、完整示例

假设已有订阅链接，希望配置「绕过大陆」透明代理：

```bash
# 1. 添加订阅并拉取
homeproxy subscription add https://your-subscription-url
homeproxy subscription update

# 2. 查看节点并设置主节点
homeproxy node list
homeproxy node set-main <节点名或ID>

# 3. 设置路由与 DNS
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

---

## 五、CLI 限制与进阶配置

| 能力 | CLI 支持 | 说明 |
|------|----------|------|
| 节点（订阅/手动/编辑） | ✅ | 完整支持 |
| 路由模式（bypass/proxy_all 等） | ✅ | 支持 |
| 主节点 / UDP 节点 | ✅ | 支持 |
| DNS 服务器（简单地址） | ✅ | 支持 `dns set` / `dns set-china` |
| 规则集（远程/本地） | ❌ | 需 UCI 或 LuCI |
| 路由规则（custom 模式） | ❌ | 需 UCI 或 LuCI |
| 路由节点（custom 模式） | 部分 | `routing set-node` 可设 main/udp，完整 routing_node 需 UCI |
| ACL 列表 | ✅ | `acl list` / `acl write` |
| 证书 / 密钥生成 | ✅ | `cert write` / `generator` |

如需自定义规则集、复杂路由规则、多路由节点等，请用 UCI 编辑 `/etc/config/homeproxy` 或使用 LuCI Web 界面。

详细配置说明可参考：

- [OpenWrt 使用 Sing-Box 插件 Homeproxy 科学上网配置教程](../homeproxy_user_wizard_examaple_from_web_scrap.md)
