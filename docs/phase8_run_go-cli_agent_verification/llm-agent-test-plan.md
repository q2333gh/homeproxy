# LLM Agent Wizard 测试计划 —— homeproxy Go CLI

## 1. 目标

验证 homeproxy Go CLI 可被 **LLM agent 以 Wizard 形式**可靠使用：agent 作为向导逐步引导用户，通过「读状态 → 决策 → 执行/询问」完成配置与运维，支持分支、跳过、错误恢复。

---

## 2. Wizard 形式 vs 全自动

| 全自动 agent | Wizard agent |
|--------------|--------------|
| 一次任务 → 一串命令执行 | 多轮对话，每轮：agent 读状态/问用户 → 执行一步 |
| 少交互，多假设 | 根据当前状态和用户回答分支 |
| 失败即报错 | 失败时解释原因、给出补救建议或重试 |

**本计划聚焦 Wizard**：agent 需能解析 CLI 输出以判断「当前处于哪一步」「下一步该做什么」「是否需要用户输入」。

---

## 3. Agent-friendliness（Wizard 所需）

| 标准 | 要求 |
|------|------|
| 非交互 | 默认不弹出确认、菜单、分页；一条命令一个动作 |
| 退出码 | 成功 exit 0，失败 exit 1；stderr 放错误信息 |
| 输出稳定 | 格式可预测，便于 agent 解析当前状态（人类可读优先，未来可加 `--json`） |
| 可组合 | stdout 可被管道/脚本消费；不混入彩色、进度条 |
| 可预测 | 字段顺序、排序稳定；格式变更可版本化 |

---

## 4. 测试分类

### 4.1 单元/契约测试（go test，无需 OpenWrt）

- **范围**：help、status、features、resources version、acl list、generator uuid 等
- **方法**：mock ubus/uci，断言 CLI 调用参数符合 LuCI API 契约
- **运行**：`cd cli-go && go test ./...`

### 4.2 Wizard 流程测试（人工 + LLM）

- **方式**：人类用自然语言与 agent 对话，agent 以向导形式一步步引导
- **重点**：agent 能读 status / subscription list / node list 做分支；能根据输出决定「跳过 / 执行 / 询问」
- **环境**：use qemu to run OpenWrt x86

### 4.3 Wizard 端到端 

- **方式**：从零开始，agent 引导用户完成一条完整配置路径
- **流程**：status → 分支（无订阅则 add；有则 update）→ node list → set-main → routing set → dns set → control start → status 确认

---

## 5. 测试场景

### 5.1 只读命令（Wizard 读状态）

| 命令 | agent 需解析以决策 |
|------|---------------------|
| `homeproxy status` | 是否已运行、主节点、路由模式 → 决定是否 start / set-main / routing set |
| `homeproxy subscription list` | 是否有订阅 → 决定 add / update / 跳过 |
| `homeproxy node list` | 节点名列表 → 决定 set-main 或询问用户选哪个 |
| `homeproxy routing get` | 当前路由模式 → 决定 set 或跳过 |
| `homeproxy dns get` | 当前 DNS → 决定 set 或跳过 |
| `homeproxy --help` / `homeproxy docs` | 可用子命令、用法 |

### 5.2 Wizard 分支路径

| 路径 | 触发条件 | 下一步 |
|------|----------|--------|
| 初次配置 | subscription list 空 | 询问订阅 URL → add |
| 已有订阅 | subscription list 非空 | update → node list → set-main |
| 已选主节点 | status 有 main_node | 可跳过 set-main |
| 已运行 | status 显示运行中 | 可跳过 control start |

### 5.3 错误与恢复（Wizard 需处理）

| 场景 | 预期 | agent 应 |
|------|------|----------|
| 未知命令 / 无效参数 | exit 1，stderr 含 usage | 解释错误，建议正确用法或询问用户 |
| 未安装 HomeProxy | exit 1，stderr 含 config 缺失 | 提示用户先安装 homeproxy |
| 权限不足 | exit 1 | 提示以 root 执行或 sudo |
| subscription update 失败 | exit 1 | 解释可能原因，询问用户是否重试或换订阅 |

### 5.4 写操作（Wizard 执行步）

| 步骤 | 命令 | agent 需解析 |
|------|------|--------------|
| 1 | `homeproxy subscription add <url>` | exit 0 表示成功 |
| 2 | `homeproxy subscription update` | exit 0 |
| 3 | `homeproxy node set-main <name>` | exit 0 |
| 4 | `homeproxy routing set bypass_mainland_china` | exit 0 |
| 5 | `homeproxy dns set tls://dns.google` | exit 0 |
| 6 | `homeproxy control start` | exit 0 |

---

## 6. Wizard 对话测试流程

1. **准备**：安装 homeproxy Go CLI，配置 mock 或真实 OpenWrt 环境
2. **任务**：给 LLM agent 一个自然语言任务，例如「帮我配置 HomeProxy，我想用绕过大陆模式」
3. **观察**：
   - agent 是否以向导形式**多轮对话**（读 status → 问订阅 URL → add → update → node list → 问选哪个 → set-main → ...）
   - 是否根据输出**分支**（有订阅则跳过 add、已运行则跳过 start）
   - 失败时是否**解释并给补救建议**
4. **记录**：哪些输出 agent 解析成功/失败；是否卡在无法判断「当前处于哪一步」

---

## 7. 当前 CLI 与 Wizard 的适配度

| 项目 | 当前 | 理想（可选） |
|------|------|--------------|
| JSON 输出 | 无 | `homeproxy status --json` 便于 agent 解析状态 |
| dry-run | 无 | 对写操作加 `--dry-run`，wizard 可「预览下一步」 |
| 输出格式版本 | 无 | `--porcelain=v1` 保证 Wizard 长期稳定解析 |
| 非交互 | ✅ 默认非交互 | 保持 |
| 退出码 | ✅ 0/1 明确 | 保持 |
| stderr 分流 | ✅ 错误走 stderr | 保持 |

---

## 8. 验收通过条件（Wizard）

- [ ] `go test ./...` 全部通过
- [ ] 只读命令（status、subscription list、node list 等）输出格式稳定、agent 能据此判断「当前处于哪一步」
- [ ] 错误场景 exit 1 且 stderr 含明确信息，agent 能解释并给出补救建议
- [ ] **Wizard 流程**：人工 + agent 对话，agent 以向导形式完成一条完整配置路径（含分支：有订阅则 skip add、已运行则 skip start）
- [ ] 无默认交互、无 TTY 依赖、无彩色/进度条混入 stdout
