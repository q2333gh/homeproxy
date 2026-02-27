下面是基于公开资料（CLI 设计指南 + 真实工具的“可脚本化/可解析输出”实践 + LLM 工具调用/结构化输出能力）总结的：LLM agent 更偏好什么样的 CLI，以及典型 bad 反例。
## LLM agent 更偏好的 CLI 长什么样
### 1) 默认非交互，可在 CI/无 TTY 环境稳定运行
• 不要默认弹出确认提示、选择菜单、分页器；需要交互时用显式 `--interactive` / `--yes`。
• “一条命令 = 一个动作”，不要中途问问题导致 agent 卡住。
• 这类“无头/自动化”思路在 agent 工具链里非常常见：例如一些 agent/CLI 会提供 headless + JSON 输出模式方便流水线解析。
### 2) 稳定、机器可读的输出（最好有 `--json` / `-o json` / `--porcelain`）
• 经典最佳实践：人类可读输出优先，但一旦需要被脚本/agent 消费，就提供结构化输出开关（JSON 最常见）。
• Kubernetes 的 `kubectl get ... -o json/yaml/jsonpath/...` 就是把“默认给人看”与“给机器解析”分开。
• Git 也明确区分：默认 `git status` 长格式是给人读且格式可能随时变；而 `--porcelain` 这类是为脚本设计、强调稳定性。
• 这和 LLM 世界的“结构化输出/严格 schema”逻辑一致：用 schema 约束输出，减少解析失败。
### 3) 清晰的退出码 + 错误输出分流
• 成功 `exit 0`；失败使用非 0；stderr 放错误信息，stdout 放“结果数据”。
• 这能让 agent 在“不看自然语言解释”的情况下也能可靠判断成败并走分支。
### 4) 可组合（Unix-style）
• 支持从 stdin 读、向 stdout 写；输出可被 `jq` 等工具二次处理。
• `jq` 本身就是“JSON 管道化处理”的典型代表，适合 agent 把多步任务拆成流水线。
• Git 文档也强调存在一类命令是为脚本链式调用设计（plumbing）。
### 5) 可预测性：确定性排序、显式字段、版本化格式
• JSON 输出字段固定、顺序/排序稳定（或提供 `--sort`）。
• 格式变更要版本化（例如 `--porcelain=v2` 这种思路），否则 agent 的解析链条会“悄悄断掉”。（“结构一变，链就断”也是结构化输出领域反复强调的问题。）
### 6) 安全护栏：`--dry-run`、幂等、可回滚
• agent 做中小任务最怕“误删/误覆盖”；CLI 如果提供：
• `--dry-run`（只展示将执行什么）
• 幂等语义（重复执行不会产生额外副作用）
• `--output-changes` / 变更摘要
会显著提高自动化可靠性。
## Bad 反例（常见会让 LLM agent 翻车的 CLI）
### 反例 A：只有人类可读输出，且格式不稳定
• `git status` 默认长输出：官方文档直接说默认格式是人类可读，内容与格式可能随时变化——这对 agent 解析非常致命。
• 对应的“好做法”是提供 `--porcelain` 这种稳定、易解析输出。
### 反例 B：“描述型命令”不给结构化输出
• `kubectl describe` 就是典型：输出是面向人阅读的说明文本，很多人会专门去问“能不能转 JSON”。这类输出让 agent 很难稳健抽字段。
• 更适合 agent 的是 `kubectl get ... -o json/yaml/jsonpath`。
### 反例 C：默认交互式提示 / 需要 TTY
• 例如默认询问 “Are you sure? (y/N)” 或进入 TUI；agent 在无交互环境会卡死。
• 解决方式：默认非交互 + `--yes/--force` 显式启用跳过确认（很多 CLI 指南都强调要可脚本化）。
### 反例 D：把“数据”混在彩色日志 / 进度条里
• ANSI 颜色、动态刷新进度条、随机插入提示语（尤其 stdout）会让解析器（包括 agent）经常误判。
• 好做法：`--no-color` / `--quiet` / `--json` 并确保 stdout 仅数据。
### 反例 E：错误不结构化、exit code 不可信
• 明明失败却 exit 0、或者把关键错误藏在 stdout 的一段自然语言里；agent 很难可靠分支处理。
## 一句话结论（给你做选型/改造的 checklist）
LLM agent 最“喜欢”的 CLI 通常具备：
非交互默认 + 明确 exit code + 结构化输出（JSON/porcelain）+ stdin/stdout 可管道 + 格式稳定/可版本化 + 安全护栏（dry-run/幂等）。
