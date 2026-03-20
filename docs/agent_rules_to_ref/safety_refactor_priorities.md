# HomeProxy Safety Refactor Priorities

本文档基于 [programming_safety.md](/home/jwk/code/homeproxy/docs/agent_rules_to_ref/programming_safety.md) 的审查框架，对当前 `root/`、`htdocs/`、`cli-go/` 源码做 safety 视角的重构优先级排序。

审查原则：

- `Internal errors`：状态机、边界、条件分支、异常处理、资源处理、数据一致性
- `System interaction/modification errors`：读外部状态、改系统前检查、改系统后确认、部分失败、回滚、审计日志

结论先行：

- 当前最高风险不在 LuCI 前端，而在“会直接修改系统状态”的编排层和后端适配层。
- 应优先收敛 `init.d + rpcd ucode + CLI system adapter + health monitor`。
- 第二优先级才是大体量配置生成和订阅导入。
- LuCI JS 主要是中低风险，更多是“配置漂移”和“输入一致性”问题。

## Reviewed Surface

本次覆盖的源码面：

- `root/etc/init.d/homeproxy`
- `root/usr/share/rpcd/ucode/luci.homeproxy`
- `root/etc/homeproxy/scripts/*.uc|*.sh|*.ut`
- `cli-go/cmd/homeproxy/*.go`
- `cli-go/internal/system/*.go`
- `htdocs/luci-static/resources/**/*.js`

未把资源文件、证书样例、生成产物和普通文档当作重构优先级主体。

## Priority 0

### 1. 服务编排与系统修改链

对象：

- `root/etc/init.d/homeproxy`
- `cli-go/internal/system/system.go`
- `cli-go/cmd/homeproxy/control.go`

原因：

- 这是最集中的系统修改入口，直接改 `dnsmasq`、`fw4`、`ip rule`、`ip route`、`tuntap`、运行时文件和服务进程。
- 当前流程偏“顺序脚本”，缺少显式阶段状态、失败分层和统一 post-check。
- 多处修改是“部分成功即可继续”，这对 safety 是高风险模式。

主要风险：

- `Incorrect external state reading`
- `Unsafe command issuance`
- `Partial update failure`
- `Missing post-check`
- `Rollback failure`

优先重构目标：

- 抽出明确的 lifecycle stage：`prepare -> apply dns -> apply routing -> start instances -> apply firewall -> verify`
- 为每个系统修改步骤定义：
  - 前置检查
  - 执行动作
  - 生效确认
  - 失败清理
- 把 stop/reload 的“清理成功条件”变成可复用检查函数，而不是只依赖命令返回码。
- 在 CLI `system` 层增加 typed helpers，减少每个命令自己猜外部状态。

完成标准：

- start/stop/reload 任一步失败，都能明确知道系统当前处于哪个阶段
- stop 后能统一确认 DNS 接管、防火墙接管、路由接管是否真的撤销
- CLI 和 init 不再各自维护分散的系统状态判断逻辑

### 2. 健康监控器与自动停机

对象：

- `cli-go/cmd/homeproxy/health_monitor.go`
- `root/etc/init.d/homeproxy`
- `root/etc/homeproxy/scripts/connection_check.sh`

原因：

- 这是新引入的自动化系统修改功能，失效时会主动触发完整 `stop`。
- 它本身就是典型的 safety 敏感路径。

主要风险：

- `Incorrect external state reading`
- `Uncontrolled automated change`
- `Unsafe timing of modification`
- `Missing audit trail`

优先重构目标：

- 把健康监控器里“配置读取、状态读取、stop 后确认”继续下沉成小接口，减少单文件状态机复杂度。
- 明确区分：
  - 读配置失败
  - 检测失败
  - stop 失败
  - stop 后确认失败
- 当前 post-check 仍偏启发式，应收敛成更稳定的系统状态判断，不要长期依赖单个文件/进程匹配。
- 为健康监控单独增加更多异常路径测试：
  - `UCIGet` 失败
  - `ServiceStatus` 失败
  - shutdown 标志残留
  - post-check 部分失败

完成标准：

- 自动停机链路的每个失败点都有稳定日志语义
- 不会因为单次外部读错就进入重复 stop 或静默退出
- post-check 逻辑不再是零散条件拼装

## Priority 1

### 3. RPC ucode 后端

对象：

- `root/usr/share/rpcd/ucode/luci.homeproxy`

原因：

- 它同时承担读状态、写文件、调系统命令、调用外部二进制等职责。
- 这是一个“高耦合网关”，容易积累系统交互类错误。

主要风险：

- `Incorrect external state reading`
- `Unauthorized system modification`
- `Unintended configuration change`
- `Missing pre-check`
- `Missing post-check`

优先重构目标：

- 把纯查询、纯文件写入、外部命令执行分层，避免一个 RPC 文件同时维护所有规则。
- 对写操作统一收敛：
  - 参数校验
  - 写前合法性检查
  - 写后确认
  - 日志记录
- 对 `certificate_write`、`acllist_write`、`resources_update` 这类修改型 RPC，补统一 error model，不再是 ad hoc 的 `{result/status/error}` 混合风格。
- 把 connection check、generator、feature detection 这类“调用外部程序”的封装抽出来，形成共享 helper。

完成标准：

- RPC 层按“查询 / 修改 / 外部执行”分出清晰模块
- 修改类 RPC 返回结构统一
- 每个修改型 RPC 都能回答“改前检查了什么、改后确认了什么”

### 4. 订阅导入与批量写配置

对象：

- `root/etc/homeproxy/scripts/update_subscriptions.uc`
- `cli-go/cmd/homeproxy/subscription.go`
- `cli-go/cmd/homeproxy/sharelink.go`

原因：

- 这是大批量外部输入进入系统配置的入口。
- 同时存在解析、过滤、去重、写 UCI、触发 reload，多步链路很容易出现部分成功。

主要风险：

- `Validation error`
- `Incorrect external state reading`
- `Incorrect state write-back`
- `Partial update failure`

优先重构目标：

- 明确“解析结果”和“落盘结果”分层，不要把解析通过与写入成功混成一个概念。
- 为批量导入建立事务式结果摘要：
  - 成功多少
  - 跳过多少
  - 失败多少
  - 主节点是否被影响
- 对 reload 触发点做收敛，减少“每个命令自己 commit + reload”的模式。
- 修正常量、拼写、兼容项处理中的隐性逻辑错误风险，例如配置项名、协议映射、过滤规则拼装。

完成标准：

- 批量导入失败不会留下难以解释的半完成状态
- 日志和命令输出能明确区分“下载成功但导入失败”和“导入成功但生效失败”

## Priority 2

### 5. 配置生成器与规则模板

对象：

- `root/etc/homeproxy/scripts/generate_client.uc`
- `root/etc/homeproxy/scripts/generate_server.uc`
- `root/etc/homeproxy/scripts/firewall_pre.uc`
- `root/etc/homeproxy/scripts/firewall_post.ut`

原因：

- 这些文件体量大、条件分支密、协议组合多，是最主要的 internal correctness 风险源。
- 但它们大多是“纯生成”逻辑，本身对系统直接修改较少，所以优先级略低于编排层。

主要风险：

- `Logic error`
- `State transition error`
- `Consistency error`
- `Boundary error`

优先重构目标：

- 继续把“读 UCI -> 归一化上下文 -> 生成 config”分成更小的阶段函数。
- 为高风险组合场景补表驱动测试，而不是仅做源码存在性断言。
- 对默认值、`nil`、空字符串、数组/对象混合值建立统一归一化规则。
- 收敛“routing_mode / proxy_mode / node type”交叉分支，减少条件爆炸。

完成标准：

- 关键生成逻辑可以在测试里基于输入 UCI fixture 验证输出 JSON/nft 片段
- 新增模式或节点类型时，不需要再跨多个巨大 switch/if 链复制逻辑

### 6. CLI 命令层

对象：

- `cli-go/cmd/homeproxy/*.go`

原因：

- 当前命令层整体清晰，但很多命令仍是“参数解析 + 直接改 UCI + reload”模板复制。
- 这更多是中风险的维护性和一致性问题。

主要风险：

- `Validation error`
- `Exception handling error`
- `Missing post-check`

优先重构目标：

- 抽公共命令模式：
  - 修改配置
  - commit
  - reload
  - 验证结果
- 对 JSON 输出和普通文本输出建立稳定 contract，避免字段和行为漂移。
- 把 `exec.Command` 直接调用进一步收敛进 `internal/system`，减少命令层绕过适配层。

完成标准：

- 命令层主要负责参数和用例，不直接决定太多系统交互细节
- 同类命令的失败语义和输出风格一致

## Priority 3

### 7. LuCI JS 视图层

对象：

- `htdocs/luci-static/resources/view/homeproxy/*.js`
- `htdocs/luci-static/resources/homeproxy/*.js`

原因：

- 这里主要是配置输入、展示和 RPC 调用，直接 safety 伤害面最小。
- 风险更多是“用户被误导”或“输入校验和后端规则漂移”。

主要风险：

- `Human interaction error`
- `Validation error`
- `As expected` drift

优先重构目标：

- 建立前后端共享的选项/枚举/说明来源，减少 LuCI 与后端语义漂移。
- 对关键危险功能补更明确的 UI 文案，例如自动停机、完整 stop 的影响面。
- 把零散的 `renderWidget/save` 模式收敛，减少状态页“局部可保存、全局不可保存”的不一致体验。

完成标准：

- 前端文案、开关、默认值与后端行为保持单一语义
- 用户能在界面层清楚理解危险操作的影响

## Recommended Order

推荐的重构推进顺序：

1. `init.d/homeproxy` + `cli-go/internal/system`
2. `cli-go/cmd/homeproxy/health_monitor.go`
3. `root/usr/share/rpcd/ucode/luci.homeproxy`
4. `update_subscriptions.uc` + CLI 导入链
5. `generate_client.uc` / `firewall_post.ut`
6. 其余 CLI 命令层
7. LuCI JS

## Practical Rule

后续凡是要动 HomeProxy 核心行为，先问四个问题：

- 这段代码是在“读外部状态”还是“改系统状态”？
- 改之前有没有明确前置条件检查？
- 改之后有没有明确生效确认？
- 失败后是 `fail-safe`、`fail-stop`、`rollback` 还是静默继续？

如果这四个问题答不清，优先重构设计，再继续加功能。
