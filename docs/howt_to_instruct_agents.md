从**开发者实际可操作的角度**，这篇文章的核心不是“AI写代码”，而是：
**开发者的主要工作从“写代码”变成“设计一个让 AI 高效开发的软件工程系统”。**

如果把文章压缩成**开发中最值得做的实践清单**，可以归纳为 **8 类极强推荐的工程实践**。

---

# 一、把“代码仓库”变成 AI 的知识中心（最重要）

核心原则：

> **Agent 看不到的知识 = 不存在**

因此必须把所有重要信息 **存入 repo**。

### 推荐做法

建立结构化知识库：

```
repo/
 ├─ AGENTS.md
 ├─ ARCHITECTURE.md
 ├─ docs/
 │   ├─ design-docs/
 │   ├─ product-specs/
 │   ├─ exec-plans/
 │   ├─ references/
 │   └─ generated/
```

内容包括：

* 架构说明
* 产品规格
* 设计原则
* 执行计划
* 技术债
* 参考文档

关键实践：

1️⃣ **AGENTS.md 只做目录，不写长说明**
2️⃣ 详细信息放 docs/
3️⃣ 文档必须 version control

不要放在：

* Google Docs
* Slack
* Notion
* 口头讨论

否则 AI 无法利用。

---

# 二、工程师的核心工作：设计 Agent 环境

工程师不再主要写代码，而是：

**设计 AI 能工作的环境**

重点工作包括：

* 定义任务
* 提供工具
* 构建反馈循环
* 分解任务

典型流程：

```
人类：
描述任务

↓
Agent：
写代码 → 开 PR

↓
Agent review
Agent test
Agent fix

↓
PR merge
```

工程师职责变成：

* 设计流程
* 设计工具
* 定义规则

---

# 三、让应用对 AI “可观测”

AI 必须能看到系统行为。

否则无法 debug。

### 推荐做法

让 agent 可以访问：

#### 1 UI

使用：

```
Chrome DevTools Protocol
```

能力：

* 截图
* DOM snapshot
* 自动点击
* 页面导航

AI 可以：

```
复现 bug
→ 修复
→ 验证
```

---

#### 2 Observability

给 agent 完整可观测系统：

```
logs
metrics
traces
```

查询接口：

```
LogQL
PromQL
TraceQL
```

例子：

```
ensure service startup < 800ms
```

agent 可以：

1 运行系统
2 分析 logs
3 修改代码
4 再运行

形成自动闭环。

---

# 四、严格架构约束（非常关键）

AI 在**强约束架构**下效率最高。

文章中的架构：

```
Types
  ↓
Config
  ↓
Repo
  ↓
Service
  ↓
Runtime
  ↓
UI
```

规则：

* 只能向前依赖
* 不允许跨层

跨领域通过：

```
Providers
```

例如：

* auth
* telemetry
* connectors
* feature flags

---

实现方式：

**用 lint + structural tests 强制执行**

例如：

```
禁止跨层 import
禁止依赖反向
```

---

# 五、把工程规则写成“自动检查”

不要靠人 review。

要靠 **机器 enforce**。

例子：

自动 lint：

* logging 必须结构化
* schema 命名规则
* 文件大小限制
* 可靠性规则

关键技巧：

**lint error message 写 remediation 提示**

这样 AI 能自动修复。

---

# 六、让 agent 能完整执行开发流程

最终目标：

Agent 可以完成：

```
复现 bug
↓
写 fix
↓
测试
↓
验证 UI
↓
开 PR
↓
处理 review
↓
修复 CI
↓
merge
```

人只在需要判断时介入。

---

# 七、自动技术债清理（AI garbage collection）

AI 会复制已有模式。

包括坏模式。

解决办法：

建立 **自动清理任务**。

做法：

每周运行 agent：

```
扫描代码
发现坏模式
自动开 refactor PR
```

例如规则：

golden principles：

1️⃣ 优先 shared utils
2️⃣ 不允许 YOLO 数据访问
3️⃣ 必须验证 schema

这样技术债会持续清理。

---

# 八、改变合并策略（高吞吐开发）

在 AI 时代：

**吞吐量远大于人类审查能力**

所以：

传统策略：

```
严格 PR gate
```

不再适合。

推荐策略：

```
快速 merge
后续修复
```

原因：

agent 可以快速修复问题。

等待人 review 成本更高。

---

# 九、优先选择“AI 友好技术”

文章有一个很关键观点：

> boring tech 更适合 AI

选择技术时优先：

✔ 稳定 API
✔ 文档清晰
✔ 训练数据多

例如：

* Postgres
* REST
* 简单库

而不是：

* 黑盒复杂框架
* 魔法工具

甚至有时：

**自己实现简单库比用复杂库更好。**

---

# 十、最重要的一句话总结

开发工作的重心从：

```
写代码
```

变成：

```
设计 AI 能高效写代码的系统
```

工程师主要做：

* 架构
* 规则
* 文档
* 工具
* 反馈循环

---

# 一个非常实用的开发 Checklist

如果要落地文章思想，最推荐做：

### 1 建立 repo 知识库

```
docs/
architecture
product-spec
exec-plan
```

---

### 2 写 AGENTS.md

作为 AI 入口。

---

### 3 建 observability

```
logs
metrics
traces
```

让 AI 可查询。

---

### 4 建 UI 自动化能力

例如：

```
Playwright
Chrome DevTools
```

---

### 5 强架构

```
layer architecture
```

---

### 6 写 custom lint

自动 enforce：

* schema
* logging
* dependency

---

### 7 自动 tech debt cleanup

周期性 AI refactor。

---

### 8 把团队知识写进 repo

不要放：

```
Slack
Notion
Google Docs
```

---

如果需要，我可以再给你一版：

**《AI时代的软件工程体系（OpenAI内部实践简化版）》**

会总结成 **一个完整可落地的 repo 模板 + workflow**。
那会更接近真正能用的工程体系。
