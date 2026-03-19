# HomeProxy 初版“节点失效自关闭”方案（Safety 修订版）

## Summary
在原方案基础上，建议补强 safety 约束，重点覆盖两类风险：

- `Internal errors`：失败轮次计数、退避时序、并发 stop、状态漂移、异常退出
- `System interaction/modification errors`：误判外部状态、误发 stop、stop 部分成功、stop 后未确认、日志审计不足

实现目标不变：健康监控器周期性执行与 LuCI Google 检测完全一致的共享 `wget google` 检查；单轮内按 `2s -> 4s -> 8s` 退避重试；连续 3 轮失败后自动执行完整 `homeproxy stop`。修订重点是把“停服务”这类系统修改动作做成有前检查、有后确认、有审计、有防重入的安全操作。

## Key Changes
### 1. 统一检测实现，并明确检测失败语义
- 保持单一真相源：LuCI `connection_check(site=google)` 和后台监控器必须共用同一 helper。
- helper 固定执行：`/usr/bin/wget --spider -qT3 https://www.google.com`。
- helper 返回值只允许两类结果：
  - `success`
  - `failure`
- 初版不引入第三种“未知/部分成功”状态；helper 内部异常一律按 `failure` 处理，并记录异常日志，避免健康状态机分叉。
- 健康监控器在每轮开始前读取一次当前服务条件：
  - `homeproxy` 客户端是否已启用
  - 自关闭开关是否仍开启
  - 是否已存在“正在停机”标志
- 任一前置条件不满足则本轮直接退出或跳过，不继续累计失败。

### 2. 健康监控器状态机收紧
- 监控脚本使用显式状态机，至少包含：
  - `warming_up`
  - `healthy`
  - `retrying`
  - `shutdown_pending`
  - `exiting`
- 单轮流程固定：
  - 周期触发主检查
  - 失败后依次退避 `2s / 4s / 8s`
  - 任一重试成功则本轮成功，失败轮次清零
  - 四次全失败才记为 1 轮失败
- 连续失败阈值固定为 3 轮。
- 增加防重入保护：
  - 使用运行时锁文件或等价单实例标志，保证同一时刻只有一个健康监控器
  - 进入 `shutdown_pending` 后立刻设置“正在停机”标志，阻止重复 stop
- 任何脚本异常退出都必须清理锁和临时状态，避免下次启动误判为“仍在停机”。

### 3. 把 stop 设计成安全的系统修改动作
自动 stop 不是普通函数调用，而是高风险系统修改，必须加前后校验：

- 修改前检查：
  - 当前服务仍处于运行态
  - 当前未处于 stop/reload 过程中
  - 当前触发者是健康监控器而不是重复流程
- 修改动作：
  - 统一调用完整 `/etc/init.d/homeproxy stop`
  - 不允许监控器自行部分清理 fw4、DNS 或路由
- 修改后确认：
  - 检查客户端实例已停止
  - 检查运行时 `fw4_post.nft` 已清空或 stop 逻辑已执行
  - 检查 dnsmasq 的 homeproxy 接管已移除
- 若 stop 命令返回成功但后确认失败：
  - 记录为 `partial shutdown`/`post-check failed`
  - 不尝试自动回滚或自动重试启动
  - 直接退出监控器，保留审计日志，避免 uncontrolled automated change

### 4. 最小配置面保持不变，但加入安全边界
- 初版仍只增加一个 UCI/LuCI 开关，例如 `config.health_auto_shutdown='0|1'`。
- LuCI 说明文案除功能说明外，明确写出：
  - 使用 `wget google`
  - 单轮失败按 `2/4/8` 秒重试
  - 连续 3 轮失败后执行完整 stop
  - 该动作会关闭 homeproxy 启用的全部行为
- 开关关闭时：
  - 不启动监控器
  - 运行时 reload 后监控器应退出
- 不暴露阈值、周期、退避参数，减少误配置风险。

### 5. 日志与审计增强
继续使用 `/var/run/homeproxy/homeproxy.log`，统一前缀 `[HEALTH]`，并要求日志具备审计价值：

- 启动监控器：记录参数、PID、锁状态、当前配置开关
- 每轮失败：记录轮次、尝试次数、退避延迟
- 每轮恢复：记录“第 N 次尝试恢复成功，失败轮次清零”
- 触发 stop 前：记录触发原因、连续失败轮次、即将执行完整 stop
- stop 后确认：
  - 成功：记录 `shutdown verified`
  - 失败：记录 `shutdown post-check failed`
- 手动 stop/reload 导致监控器退出时，记录退出原因
- 日志避免周期性成功刷屏，但必须保留所有自动停机相关关键事件，形成最小 audit trail

## Test Plan
### 自动化测试
补充源码级测试，除原计划内容外，新增 safety 断言：

- `connection_check` 已调用共享 helper，不再内联 `wget`
- helper 固定使用 `wget --spider -qT3 https://www.google.com`
- 默认参数存在：`60s` 宽限期、`30s` 周期、`3` 轮阈值、`2/4/8` 退避
- 健康监控存在单实例保护或等价防重入机制
- 健康监控触发动作是完整 `homeproxy stop`，不是局部清理
- 存在 stop 前检查和 stop 后确认逻辑
- 日志关键字存在：
  - 启动
  - 单次失败
  - 退避重试
  - 轮次恢复
  - stop 触发
  - shutdown verified / post-check failed
- LuCI 页说明文案明确 `2/4/8` 策略和“完整 stop”语义

### 手工/集成场景
1. 正常节点
   - `wget google` 成功
   - 服务持续运行
   - 无周期性成功刷屏日志

2. 短时抖动
   - 首次失败，2 秒后恢复
   - 本轮不记失败
   - 日志记录失败与恢复

3. 深抖动恢复
   - 前几次重试失败，最后一次成功
   - 本轮不记失败
   - 失败轮次清零

4. 持续失效
   - 某轮 4 次尝试全部失败，记为 1 轮失败
   - 连续 3 轮失败后自动执行完整 stop
   - stop 后确认通过
   - DNS、fw4、策略路由接管已撤销

5. stop 部分失败
   - 模拟 stop 返回后清理未完全完成
   - 必须记录 `post-check failed`
   - 不应自动 restart，不应进入无限 stop 循环

6. 手动 stop / reload 并发
   - 在监控轮次中手动执行 stop 或 reload
   - 监控器不得重复下发 stop
   - 最终无残留锁、无重复停机日志

7. 开关关闭
   - 不启动监控器
   - reload 后已运行监控器应退出
   - 原行为不变

## Assumptions
- 初版不做自动恢复；保护停机后由用户手动重启。
- 初版只提供启用开关，不暴露周期、阈值、退避参数。
- 健康检查语义固定为“OpenWrt 本机在当前 homeproxy 接管状态下执行 `wget https://www.google.com` 是否成功”。
- 单轮失败定义为：初次检查失败后，再按 `2s -> 4s -> 8s` 完成 3 次退避重试后仍全部失败。
- 自动停机属于高风险系统修改动作，必须具备前检查、单实例/防重入、后确认和审计日志。
- 关闭自身的定义是完整 `homeproxy stop`，包括客户端、服务端、DNS 接管、防火墙和路由清理。
