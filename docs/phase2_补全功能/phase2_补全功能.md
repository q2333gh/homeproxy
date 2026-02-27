# Phase 2: Go CLI 功能补全核查

> 事实来源：`root/usr/share/rpcd/ucode/luci.homeproxy`、`docs/api-reference.md`、`cli-go/`、`cli/`

---

## 一、RPC 方法对照

| RPC 方法 | 说明 | Go CLI | Shell CLI |
|----------|------|--------|-----------|
| `connection_check` | 连接检测 (baidu/google) | ✓ node test | ✓ |
| `singbox_get_features` | 获取 sing-box 特性 | ✓ status, features | ✓ |
| `resources_get_version` | 获取资源版本 | ✓ resources version | ✗ |
| `resources_update` | 更新资源 (gfw_list/china_ip4 等) | ✓ resources update | ✗ |
| `acllist_read` | 读取 ACL 列表 (direct_list/proxy_list) | ✓ acl list | ✗ |
| `acllist_write` | 写入 ACL 列表 | ✓ acl write | ✗ |
| `certificate_write` | 写入证书 (需 /tmp/homeproxy_certificate.tmp) | ✓ cert write | ✗ |
| `log_clean` | 清理日志 (homeproxy/sing-box-c/sing-box-s) | ✓ log clean | ✗ |
| `singbox_generator` | 生成密钥 (uuid/reality-keypair/wg-keypair 等) | ✓ generator | ✗ |

---

## 二、UCI 配置节/选项覆盖

| 配置节 | 说明 | Go CLI |
|--------|------|--------|
| `homeproxy.config` | main_node, routing_mode, routing_port, proxy_mode, dns_server, china_dns_server | ✓ |
| `homeproxy.dns` | dns_strategy, disable_cache | ✓ |
| `homeproxy.subscription` | subscription_url, filter_keywords, auto_update, allow_insecure | ✓ |
| `homeproxy.node` | 节点 CRUD | ✓ |
| `homeproxy.routing` | default_outbound, sniff_override | ✓ routing rules |
| `homeproxy.infra` | 端口、TUN 等 | ✗ |
| `homeproxy.control` | 访问控制 | ✗ |
| `homeproxy.server` | 服务器模式 | ✗ |

---

## 三、命令实现完整度

### 3.1 已实现

| 命令 | 子命令 | 状态 |
|------|--------|------|
| status | - | ✓ |
| control | start, stop, restart, status | ✓ |
| log | [type], clean [type] | ✓ |
| node | list, test, set-main, add, remove, edit, import, export | ✓ |
| routing | get, set, set-node, rules, status | ✓ |
| dns | get, set, set-china, test, cache, strategy, status | ✓ |
| subscription | list, add, remove, update, auto-update, filter, status | ✓ |
| features | - | ✓ |
| resources | version [type], update \<type\> | ✓ |
| acl | list \<type\>, write \<type\> --file \<path\> | ✓ |
| cert | write \<filename\> --file \<path\> | ✓ |
| generator | \<type\> [params] | ✓ |

### 3.2 与 Shell CLI 差异

- **routing rules**：Go CLI 已实现 `routing rules`，展示 default_outbound、default_outbound_dns、sniff_override。
- **-j/--json**：Shell help 有声明，实际未贯穿；Go CLI 未实现 JSON 输出。

---

## 四、Phase 2 补全建议（已实现）

### 4.1 高优先级（核心 RPC 能力）

| 功能 | 实现方式 | 说明 |
|------|----------|------|
| `homeproxy log clean [type]` | 调用 `log_clean` | 清理 homeproxy/sing-box-c/sing-box-s 日志 |
| `homeproxy resources version [type]` | 调用 `resources_get_version` | china_ip4, china_ip6, china_list, gfw_list |
| `homeproxy resources update <type>` | 调用 `resources_update` | 触发 update_resources.sh |

### 4.2 中优先级（ACL / 证书）

| 功能 | 实现方式 | 说明 |
|------|----------|------|
| `homeproxy acl list <direct_list\|proxy_list>` | 调用 `acllist_read` | 输出直连/代理列表内容 |
| `homeproxy acl write <type> --file <path>` | 调用 `acllist_write` | 需先读文件再传 content |
| 证书写入 | 调用 `certificate_write` | 需先 cat 到 /tmp/homeproxy_certificate.tmp，CLI 适合做封装 |

### 4.3 低优先级（生成器）

| 功能 | 实现方式 | 说明 |
|------|----------|------|
| `homeproxy generator uuid` | 调用 `singbox_generator` | 输出 UUID |
| `homeproxy generator reality-keypair` | 同上 | 输出密钥对 |
| `homeproxy generator wg-keypair` | 同上 | WireGuard 密钥对 |

### 4.4 可选（路由规则 / infra）

| 功能 | 说明 |
|------|------|
| `homeproxy routing rules` | 读取 homeproxy.routing，展示 default_outbound、规则概要 |
| `homeproxy routing rule add` | 需明确 UCI 规则结构后再设计 |

---

## 五、实现参考

- RPC 调用封装：`cli-go/internal/system/system.go` 中 `UBUSCall(object, method, params)`
- 新增命令：在 `main.go` 中增加 case，新建 `cmd/homeproxy/<command>.go`

---

## 六、Phase 2 实现完成

Phase 2 补全已于当前版本实现，对应命令与文件：

- `log clean` → [cli-go/cmd/homeproxy/log.go](cli-go/cmd/homeproxy/log.go)
- `resources` → [cli-go/cmd/homeproxy/resources.go](cli-go/cmd/homeproxy/resources.go)
- `acl` → [cli-go/cmd/homeproxy/acl.go](cli-go/cmd/homeproxy/acl.go)
- `cert` → [cli-go/cmd/homeproxy/cert.go](cli-go/cmd/homeproxy/cert.go)
- `generator` → [cli-go/cmd/homeproxy/generator.go](cli-go/cmd/homeproxy/generator.go)
- `routing rules` → [cli-go/cmd/homeproxy/routing.go](cli-go/cmd/homeproxy/routing.go)
