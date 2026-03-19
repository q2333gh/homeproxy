 
 
---

# **Software Safety Cheat Sheet（最终版）**

---

## 0. 核心目标：Correctness + As Expected + Safety

对于软件开发，我们通常同时追求三个目标：

### Correctness

软件在给定输入、状态和规则下，产生**正确结果**。

### As Expected

软件的行为符合设计意图、用户预期和系统约束，也就是 **behave as expected**。

### Safety

当出现异常、故障、错误输入、误操作、外部依赖失效或部分失败时，软件仍然**不会导致不可接受的后果**。

---

### 三者关系

* **Correctness**：做得对不对
* **As Expected**：行为是否符合预期
* **Safety**：即使不对或不符合预期，也不要造成危险后果

> **Software safety does not replace correctness; it complements it.**
> 我们不仅希望软件 **correct and as expected**，还希望它在非预期条件下仍能 **fail safely**。

---

## 1. 两大类错误

### A. 程序内部错误（Internal Errors）

发生在软件内部逻辑、状态、计算、异常处理过程中，会导致软件行为**不 correct** 或 **not as expected**。

常见类型：

* 输入校验错误
* 边界值错误
* 状态转换错误
* 时序 / 同步错误
* 异常处理错误
* 故障恢复错误
* 权限控制错误
* 数据一致性错误
* 逻辑判断错误
* 资源耗尽错误
* 人机交互错误

**典型例子**

* 未初始化就启动
* 数组越界
* 通信失败后仍继续运行
* `&&` 写成 `||`
* 内存泄漏导致系统崩溃

---

### B. 系统交互 / 系统修改错误（System Interaction / Modification Errors）

发生在软件与外部系统交互，或软件对系统进行控制、配置、更新、写回时，会导致系统行为**不 as expected**，甚至进入不安全状态。

常见类型：

* 错误读取外部状态
* 错误下发控制命令
* 未授权修改系统
* 非预期配置修改
* 错误状态写回
* 部分修改成功、部分失败
* 回滚失败
* 接口 / 协议不匹配
* 在错误时机修改系统
* 修改前缺少校验
* 修改后缺少确认
* 自动化修改失控
* 缺少审计与追踪
* 外部依赖异常导致误动作

**典型例子**

* 读取到旧状态却继续下发任务
* 应该停机却发成启动
* 升级时把安全参数恢复默认
* 配置写入成功一半导致系统不一致
* 发送停机命令后没确认设备是否真的停止

---

## 2. 最关键的区分

### Internal Error

关注：

* 程序“自己”算错
* 状态机错
* 判断错
* 异常没处理好
* 结果不 correct
* 行为不符合预期

### System Interaction Error

关注：

* 软件“读错外部系统”
* 软件“改错系统”
* 软件“在不该改的时候改”
* 软件“改完没验证”
* 系统行为偏离 as expected
* 外部影响导致不安全后果

---

## 3. 写文档时可直接用的分类

### Internal

* Validation error
* Boundary error
* State transition error
* Timing / synchronization error
* Exception handling error
* Recovery error
* Logic error
* Consistency error
* Resource handling error

### Interaction / Modification

* Incorrect external state reading
* Unsafe command issuance
* Unauthorized system modification
* Unintended configuration change
* Incorrect state write-back
* Partial update failure
* Rollback failure
* Interface mismatch
* Unsafe timing of modification
* Missing pre-check
* Missing post-check
* Uncontrolled automated change
* Missing audit trail

---

## 4. 失效处置原则（出错后怎么办）

当软件已经 **not correct** 或 **not as expected** 时，需要明确处置原则：

### Fail-safe

出错时进入安全状态。
例：检测异常后自动停止危险动作。

### Fail-stop

在不确定状态下停止关键操作，而不是继续冒险执行。
例：无法确认目标设备身份时拒绝下发命令。

### Rollback

部分修改失败时恢复到一致状态。
例：配置发布失败后恢复到上一稳定版本。

### Graceful degradation

不能完整工作时，降级运行，而不是乱工作。
例：推荐服务失败时只关闭推荐模块，不影响主流程。

---

## 5. safety 分析里最常用的几个关注点

做 safety review / hazard analysis 时，优先检查：

### 先看 correctness / as expected

* 这个功能的正确行为定义清楚了吗？
* “as expected” 是按谁的预期：设计、用户、系统还是运维？
* 正常路径下结果是否正确？
* 异常路径下行为是否仍符合预期约束？

### 读之前

* 读取的数据是不是最新的？
* 数据是不是完整的？
* 数据是不是可信的？

### 改之前

* 当前系统状态允许修改吗？
* 权限足够吗？
* 前置条件满足吗？

### 改的时候

* 命令对象对吗？
* 参数对吗？
* 单位对吗？
* 时机对吗？

### 改之后

* 修改真的生效了吗？
* 系统进入预期状态了吗？
* 失败时能完整回滚吗？
* 有没有日志和审计记录？

---

## 6. 风险分级（不是所有软件都要同样强度）

### 低风险软件

如普通工具、展示页面、个人辅助软件。
通常做基础防错即可。

### 中风险软件

如配置系统、权限系统、财务系统、自动化运维平台。
需要较系统的 safety 控制。

### 高风险软件

如医疗、车辆、航空、工业控制、电力系统。
需要严格 safety 工程方法、冗余、隔离和专门分析。

> 结论：**大多数软件都需要 safety，只是强度不同。**

---

## 7. 最小安全检查清单（Checklist）

评审时至少检查：

* 正常路径是否 correct？
* 异常路径是否仍 as expected？
* 外部输入是否有校验？
* 修改前是否检查前置条件和权限？
* 修改后是否确认真正生效？
* 部分失败时是否能回滚或停机？
* 不确定状态下是否进入安全模式？
* 是否有日志、审计和追踪能力？

---

## 8. 一句话总结版

> Software safety error 不仅包括程序内部的逻辑、状态和异常处理错误，也包括软件与外部系统交互及修改系统时产生的错误。我们的目标不仅是让软件结果 **correct**、行为 **as expected**，还要保证在异常、失效或非预期条件下，系统仍不会产生不可接受的后果。

---

## 9. 超短速记版

### 目标

* 做对（correct）
* 符合预期（as expected）
* 出错也别出大事（safe）

### 内部错误

* 算错
* 判错
* 状态错
* 异常处理错

### 系统交互 / 修改错误

* 读错
* 发错
* 改错
* 改一半
* 回不去
* 没验证
* 没审计

### 出错后的原则

* 停
* 回
* 降级
* 进安全状态

---

## 10. 适合在汇报里说的话

### 中文版

> 对于软件开发，我们不仅希望服务在正常情况下结果正确、行为符合预期，还希望它在异常、故障、错误输入或部分失败时，仍能以安全方式处理，避免不可接受的后果。

### 英文版

> In software development, we expect services to behave correctly and as expected. Software safety extends this goal by ensuring that even under faults, unexpected inputs, dependency failures, or partial updates, the system still avoids unacceptable outcomes.

 