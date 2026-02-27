
基于 `docs/refac_go_cli_v1_arch_analyze.md` 里的第一性原理，对当前 Go CLI 的核查如下。

---

## 第一性原理核查

### 已做到

| 原则                           | 现状                                                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| **权威状态在 UCI/init.d/ubus** | CLI 只通过 `system` 调用外部命令，不做额外持久化                                                                                |
| **CLI 是 façade**              | 命令逻辑集中在 `cmd/homeproxy/*.go`，只是对 UCI/ubus 的薄封装                                                                   |
| **可维护性 > 功能面子**        | 未暴露 stub，help 里的命令都有实现                                                                                              |
| **基础设施集中**               | 路径与检查集中在 `internal/system`（ConfigFile、InitScript、LogDir、RPCObject、CheckInstalled、UCIGet/UCISet/UBUSCall），无重复 |
| **统一输出模型**               | 未声明 `-j/--json`，只做人类可读文本输出                                                                                        |
| **node 命名收敛**              | `node_add` 不再用假的 `node_name`，提示 “Use label or section ID with 'homeproxy node set-main'”                                |
| **入口单一**                   | `main.go` 只做命令路由，不重复实现 `check_installed` 等                                                                         |

---

### 可优化点（轻微）

1. **`--file` 解析重复**  
   `acl.go` 和 `cert.go` 都用同一套 `for i := 0; i < len(args); i++` 解析 `--file` / `-f`。可提取一个 `parseFileFlag(args []string) (typ, filePath string, err error)`，但改动不大，当前重复也容易理解。

2. **RPC 返回解析模式重复**  
   acl、cert、resources 等对 `{result, error}` 的解析结构类似，但各自字段不同。集中抽取会引入更复杂的泛型或反射，未必比分散实现更直观。

3. **`valid*` 函数分散**  
   `validACLType`、`validCertFilename` 等逻辑类似但列表各异。提取 `containsString(list []string, s string) bool` 能减少几行重复，但会增加一层间接。

---

### 结论

**整体已满足第一性原理要求：**

- 基础设施集中、无漂移
- 薄封装、无过度抽象
- 无半成品（JSON、stub）暴露
- node 命名收敛、无假 name
- 入口清晰、职责单一

上述“可优化点”都是小规模 DRY 问题，不改也能接受。若要改进，优先考虑提取 `parseFileFlag`，成本低、收益明确。