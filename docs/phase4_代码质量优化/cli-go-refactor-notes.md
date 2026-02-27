# cli-go 可优化点调查

基于对 `cli-go/` 的审阅，整理可简洁优化、复用和代码质量提升点。

---

## 1. 重复模式

### 1.1 root 权限检查

多处出现相同逻辑：

```go
if os.Geteuid() != 0 {
    return fmt.Errorf("this command requires root privileges")
}
```

涉及：`control`, `resourcesUpdate`, `aclWrite`, `certWrite`, `nodeSetMain`/`Add`/`Remove`/`Edit`, `routingSet`/`SetNode`, `dnsSet`/`SetChina`/`Cache`/`Strategy`, `subscriptionAdd`/`Remove`/`Update`/`AutoUpdate`/`Filter` 等。

**建议：** 提取 `requireRoot() error`

---

### 1.2 UCI 写后提交并 reload

典型流程：

```go
system.UCISet(...)
system.UCICommit("homeproxy")
system.ServiceReload()
```

在 `nodeSetMain`, `nodeRemove`, `nodeEdit`, `routingSet`, `routingSetNode`, `dnsSet`, `dnsSetChina`, `dnsCache`, `dnsStrategy`, `subscription*` 等中重复。

**建议：** 提取 `uciCommitAndReload() error`，写 UCI 后统一调用。

---

### 1.3 类型校验 + 错误信息

多处类似：

```go
if !containsString(xxxTypes, typ) {
    return fmt.Errorf("invalid type: %s (use: %s)", typ, "a, b, c")
}
```

涉及：`resources`, `acl`, `generator`, `cert`。

**建议：** 提取 `validateOneOf(value string, allowed []string, name string) error`。

---

### 1.4 `dnsSet` / `dnsSetChina` 结构重复

两处实现几乎相同，仅 UCI 路径和日志不同：

- `dnsSet`: `homeproxy.config.dns_server`, "DNS server"
- `dnsSetChina`: `homeproxy.config.china_dns_server`, "China DNS server"

**建议：** 合并为 `dnsSetServer(args []string, uciPath, label string) error`。

---

### 1.5 UCI list 的删除逻辑

`subscriptionRemove`、`subscriptionFilter remove` 中都存在：

1. UCIGet 获取当前 list
2. 过滤掉目标项
3. UCIDelete 清空
4. 遍历剩余项 UCIAddList

**建议：** 提取 `uciRemoveFromList(path, value string) error`。

---

## 2. 一致性

### 2.1 类型白名单：slice vs map

- `resourceTypes`, `aclTypes`, `generatorTypes`, `certFilenames` 使用 `[]string` + `containsString`
- `validLogTypes`, `routingModes`, `dnsStrategies`, `nodeTypes` 使用 `map[string]bool` / `map[string]string`

**建议：** 简单白名单统一用 `[]string` + `containsString`，需要显示名再考虑 map。

---

### 2.2 `logInfo` / `logWarn` 输出目标

当前 `logInfo` / `logWarn` 写到 `os.Stdout`。按 CLI 惯例，诊断信息更适合 `os.Stderr`，便于：

- `homeproxy acl list direct_list > list.txt` 只包含列表内容
- 目前 `acl list` 未调用 logInfo，已满足；但 `status`、`features` 等若重定向，会把 `[INFO]` 混入 stdout

**建议：** 将 `logInfo` / `logWarn` 改为写入 `os.Stderr`，数据输出继续用 stdout。

---

### 2.3 `nodeTypes` 与 `validTypes` 重复

`node.go` 中：

- `nodeTypes map[string]string` 用于显示
- `nodeAdd` 内 `validTypes map[string]bool` 用于校验

有效节点类型在两处维护。

**建议：** 使用单一 map，例如 `nodeTypes map[string]string`，校验时用 `_, ok := nodeTypes[typ]`。

---

## 3. 代码质量

### 3.1 未使用变量

- `routingCommand`, `dnsCommand` 等中的 `rest := args[1:]` 会传给子函数，属于合理使用
- 个别分支若未用到 `rest`，可考虑省略或加 `_ = rest` 以消除 lint 警告（如有）

---

### 3.2 错误处理

- 多数 `UCIGet` 忽略错误（`_, _ := system.UCIGet(...)`），在 UCI 缺失或失败时可能得到空字符串，逻辑上可接受
- 关键写操作（UCISet、UCICommit、ServiceReload）有错误返回，整体可接受

---

### 3.3 `dns.go` 直接使用 `exec`

`dnsTest` 直接用 `exec.Command` 调用 nslookup/dig，而其他命令通过 `system.runCommand` 调用 uci/ubus。

**建议：** 保持现状即可。`runCommand` 主要面向 uci/ubus 的场景，dns 测试需要解析命令输出，直接 `exec` 更合适。

---

## 4. 可选简化（非必须）

### 4.1 `validLogTypes` 的表示

当前：`map[string]bool{"homeproxy": true, ...}`  
可改为：`logTypes = []string{"homeproxy", "sing-box-c", "sing-box-s"}` + `containsString`，与其他命令风格统一。

---

### 4.2 URL 校验复用

`subscriptionAdd` 和 `nodeImport` 都校验 `strings.HasPrefix(url, "http://") || strings.HasPrefix(url, "https://")`。

**建议：** 提取 `isHTTPURL(s string) bool` 或 `validateHTTPURL(s string) error`。

---

### 4.3 表驱动子命令

`routing`, `dns`, `subscription` 等的 `switch action` 可改为表驱动（map[string]func），但在子命令不多的情况下，显式 switch 更直观，当前写法可保留。

---

## 5. 优先级建议

| 优先级 | 项目 | 影响 |
|--------|------|------|
| 高 | `requireRoot()` | 减少约 15 处重复 |
| 高 | `uciCommitAndReload()` | 减少约 20 处重复 |
| 中 | `validateOneOf()` | 统一类型校验 |
| 中 | `dnsSet` + `dnsSetChina` 合并 | 减少重复代码 |
| 中 | `logInfo`/`logWarn` → stderr | 重定向行为更符合预期 |
| 低 | `uciRemoveFromList()` | 简化 list 删除逻辑 |
| 低 | `nodeTypes` 与 `validTypes` 统一 | 单点维护 |
| 低 | `isHTTPURL()` | 小范围复用 |

---

## 6. 总结

- 重复最集中的是 root 检查和 UCI 提交+reload，提取两个 helper 即可显著减重复。
- 其余多为风格与一致性优化，可按优先级逐步调整。
- 当前结构（按命令拆分、system 适配层、testutil mock）清晰，无需大改。
