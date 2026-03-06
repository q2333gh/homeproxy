# HomeProxy 重构计划（2026-03-06）

## 1. 目标

本次重构不追求“大改重写”，而是围绕以下四个目标渐进推进：

1. 先修复高风险缺陷，避免当前逻辑继续带病演进
2. 结构性重构顺序明确为：先 LuCI JS，后 `generate*.uc`
3. 为关键路径补自动化保护，减少回归
4. 建立最小工程化基线，让后续迭代可以持续受控

## 2. 范围

本计划覆盖以下自有代码：

- LuCI 前端：`htdocs/luci-static/resources/view/homeproxy/client.js`
- LuCI 前端：`htdocs/luci-static/resources/view/homeproxy/node.js`
- LuCI 前端：`htdocs/luci-static/resources/view/homeproxy/server.js`
- 运行时配置生成：`root/etc/homeproxy/scripts/generate_client.uc`
- 运行时配置生成：`root/etc/homeproxy/scripts/generate_server.uc`
- 订阅与辅助脚本：`root/etc/homeproxy/scripts/update_subscriptions.uc`
- RPC 后端：`root/usr/share/rpcd/ucode/luci.homeproxy`
- 启停脚本：`root/etc/init.d/homeproxy`
- Go CLI：`cli-go/`

不纳入本轮重构主体：

- `sing-box-ref/`
- `root/etc/homeproxy/resources/*`
- 历史文档目录

## 3. 重构原则

- 先止血，再抽象，不做“边修 bug 边大改架构”
- 先拆职责，再抽公共层，避免过早封装
- 每个阶段结束时都保持可构建、可测试、可回滚
- 重构优先围绕高变更区和高故障区，不追求表面统一
- 新增抽象必须服务于测试性或复用性，禁止为了“看起来高级”而引入层次

## 4. 分阶段计划

### 阶段 A：止血与建立最小保护

目标：修复已发现的高风险点，并让最基本测试进入持续集成。

任务：

1. 修复 `root/etc/homeproxy/scripts/generate_client.uc` 中 `match(proxy_mode), /tproxy/` 与 `match(proxy_mode), /tun/` 的条件判断问题
2. 为 `generate_client.uc` 增加最小回归验证样例，至少覆盖：
   - `redirect_tproxy`
   - `redirect_tun`
   - `tun`
3. 在 `.github/workflows/build-ipk.yml` 中加入 `cd cli-go && go test ./...`
4. 为 Go CLI 增加覆盖率输出，先观察，不立即卡阈值
5. 为 `root/etc/init.d/homeproxy` 保留当前行为并补一个最小语法/冒烟检查脚本

交付物：

- 修复后的 `generate_client.uc`
- 最小回归测试或冒烟校验脚本
- 执行 `go test` 的 CI

验收标准：

- `cli-go` 测试继续通过
- 修复后 `proxy_mode` 三种分支行为与预期一致
- PR 中能够看到 CI 实际执行测试

风险：

- 如果先做大拆分，再修逻辑缺陷，容易把缺陷扩散到更多文件

### 阶段 B：拆分 LuCI 大文件

目标：把前端大文件从“按页面堆叠”改成“按职责组织”。

任务：

1. 拆分 `htdocs/luci-static/resources/view/homeproxy/client.js`
2. 拆分 `htdocs/luci-static/resources/view/homeproxy/node.js`
3. 抽出可复用的校验器、选项构造器和状态展示逻辑
4. 将重复的 `o.value(...)`、`o.validate = function ...`、依赖关系拼装迁移到辅助函数
5. 为公共辅助逻辑建立命名约定，避免继续在页面文件中内联复制

建议拆分方式：

- `client.js`
  - 基础状态/加载逻辑
  - DNS 设置
  - 路由设置
  - ACL/附加输入
  - 公共校验器
- `node.js`
  - 分享链接解析
  - 节点通用字段
  - 协议特定字段
  - 传输层/TLS 子块
  - 提交前标准化逻辑

交付物：

- 拆分后的 LuCI 模块文件
- 页面入口改为组合装配，而不是单文件堆叠

验收标准：

- 功能行为与现状一致
- 单个文件长度明显下降，尽量控制在 300 到 500 行量级
- 新增节点类型或路由选项时，不再需要在一个超长文件里跨多个区域修改

风险：

- LuCI 运行环境不是标准前端工程，模块拆分要遵守其加载方式，不能直接照搬现代打包器思路

### 阶段 B 复核结论与 B.5 收尾

复核时间：2026-03-06

结论：

- 阶段 B 的方向正确，但完成度只有一半
- `client.js` 已经出现有效收敛，页面文件中的重复 `load()`、DNS 校验和域名列表读写被集中
- `node.js` 仍存在“复杂度搬家”问题：页面文件变短了，但分享链接解析和导入流程被集中到新的共享模块中，单点复杂度仍然过高

从第一性原理看，阶段 B 之后还需要满足以下条件，才算真正完成：

1. 模块边界要稳定，不只是把大段代码从页面文件挪到公共文件
2. 共享抽象要表达领域语义，而不是只抽出循环模板
3. 中心化 helper 增加后，必须同步增加最小回归护栏，否则只是把风险从多个点收束到一个更危险的单点

本轮复核识别出的主要问题：

1. `homeproxy/node.js` 中分享链接解析仍是超长分发器，导入流程仍混合了 UI、解析、归一化、UCI 写入和刷新逻辑
2. `homeproxy/client.js` 中 `bindSectionListLoad()` 虽然减少重复，但抽象层级偏低，未直接表达“启用的 DNS server / routing node / rule set”这样的领域语义
3. 阶段 B 尚未同步引入对应的最小回归样例，公共 helper 的扇出已经增大，但验证护栏还没有补齐

因此增加一个阶段 B.5，作为 LuCI JS 拆分的收尾：

任务：

1. 将 `homeproxy/node.js` 继续拆为：
   - 分享链接协议解析函数
   - 解析结果归一化函数
   - 节点导入与 UCI 写入函数
   - UI 弹窗装配函数
2. 将 `homeproxy/client.js` 的通用 section loader 继续收敛为语义化 loader：
   - enabled DNS server
   - enabled routing node
   - enabled rule set
3. 为后续测试阶段预留稳定入口，确保 parser / loader helper 可以被单独审查和最小样例覆盖

阶段 B.5 验收标准：

- `view/homeproxy/node.js` 继续保持装配层角色
- `homeproxy/node.js` 中不再由单一函数同时承担解析、归一化、导入、UI 刷新四类职责
- `homeproxy/client.js` 调用点不再反复书写“sectionType + enabled predicate”这种低语义模板
- LuCI JS 的后续变更可以在更小的函数级别上完成审查

### 阶段 C：拆分 ucode 配置生成链路

目标：把 `generate_client.uc` 从“单文件大对象拼装”改成“分段生成、分层装配”。

任务：

1. 将 `root/etc/homeproxy/scripts/generate_client.uc` 按职责拆分为：
   - UCI 读取与默认值归一化
   - DNS 生成
   - Outbound/Endpoint 生成
   - Route 生成
   - 最终 JSON 组装与输出
2. 将节点到 sing-box 字段映射改成更可审查的结构，减少超长平铺对象
3. 把协议特定生成逻辑和公共传输/TLS 逻辑拆开
4. 为 `generate_server.uc` 对齐相同组织方式，避免客户端和服务端生成器继续分叉
5. 对 `update_subscriptions.uc` 中共享的规范化逻辑进行复用评估

交付物：

- 拆分后的 ucode 模块
- 更清晰的配置生成主入口

验收标准：

- 生成出的 JSON 在核心路径上与旧逻辑等价
- 出现配置错误时，定位范围可缩小到具体模块
- 新增一个协议字段时，不需要阅读整个 900+ 行文件

风险：

- 这是行为敏感区，必须在阶段 A 的最小回归保护之后进行

### 阶段 D：RPC 与运行时脚本硬化

目标：收敛运行时副作用和命令拼接风险。

任务：

1. 审查 `root/usr/share/rpcd/ucode/luci.homeproxy` 的所有 shell 调用点
2. 处理 `singbox_generator` 的参数拼接问题，避免未转义参数直接进入 shell
3. 对 `certificate_write`、`resources_update`、`connection_check` 等方法补参数边界校验
4. 梳理 `root/etc/init.d/homeproxy` 中的职责边界：
   - 配置生成
   - DNSMasq 配置
   - 路由表处理
   - procd 实例管理
   - 防火墙调用
5. 将重复 shell 逻辑提炼为局部函数，减少长函数中的状态跳转

交付物：

- 硬化后的 rpcd 方法
- 更可读的 init 脚本局部函数组织

验收标准：

- 参数异常时返回明确错误
- shell 调用点减少且转义方式统一
- init 脚本核心路径更易审查

### 阶段 E：测试与质量基线补齐

目标：建立最低限度的持续质量约束。

任务：

1. 为 Go CLI 持续补测试，优先覆盖：
   - share link 变体解析
   - JSON 输出
   - 参数校验
   - ubus/uci 契约
2. 为 ucode 生成器增加文件级回归样例
3. 为 rpcd 方法增加输入输出级测试
4. 评估接入：
   - `shellcheck`
   - `shfmt`
   - Go 格式和静态检查
5. 新增仓库级质量入口，例如 `make test` / `make check`

交付物：

- 可持续执行的质量检查命令
- CI 中可见的测试与检查步骤

验收标准：

- 新提交至少经过一轮自动测试
- Go 侧覆盖率逐步提升
- 核心脚本修改后能触发回归验证

## 5. 推荐实施顺序

推荐按以下顺序落地，不建议并行大范围推进：

1. 阶段 A
2. 阶段 B
3. 阶段 E 中的 CI 接入部分与最小检查
4. 阶段 C
5. 阶段 D
6. 阶段 E 其余测试补齐

原因：

- 阶段 A 只做止血，不做结构性大拆分
- 结构性重构先从 LuCI JS 开始，更容易观察 UI 行为是否保持一致
- LuCI 拆分完成后，再拆 `generate_client.uc` / `generate_server.uc`，可以避免同时改两个高复杂区
- CI 的最小测试接入应尽早完成，但不必阻塞 LuCI JS 拆分启动
- RPC/init 硬化放在后段更稳，因为前面拆分后边界会更清楚

## 6. 里程碑定义

### M1：可安全继续开发

达成条件：

- `generate_client.uc` 高风险缺陷已修
- LuCI JS 拆分范围已确认
- CI 已执行 `go test ./...` 或已完成接入方案落地

### M2：前端维护成本下降

达成条件：

- `client.js`、`node.js` 完成拆分
- 页面功能无明显回归
- 重复校验/选项构造逻辑被收敛

### M3：配置生成链路可维护

达成条件：

- `generate_client.uc`、`generate_server.uc` 完成职责拆分
- 关键协议配置生成逻辑有回归样例保护

### M4：工程化闭环形成

达成条件：

- CI 中存在测试与基本检查
- 关键脚本/接口具备最小自动回归
- 新功能可沿已有模块边界扩展

## 7. 不建议的做法

- 不建议直接重写整个 LuCI 层
- 不建议先把 ucode 全量迁移到 Go 或别的语言
- 不建议在没有测试护栏时一次性拆 `client.js`、`node.js`、`generate_client.uc`
- 不建议为了统一风格而大面积改动无行为变化的代码
- 不建议引入复杂构建链，只为解决当前几个超长文件问题

## 8. 近期可执行任务清单

如果按两到三周节奏推进，建议近期任务切成下面 8 项：

1. 修复 `generate_client.uc` 条件判断 bug
2. 梳理 `client.js` 的拆分边界
3. 先抽出 `client.js` 的公共校验器
4. 梳理 `node.js` 的分享链接解析与协议字段边界
5. 完成 LuCI JS 第一轮拆分
6. CI 接入 `go test ./...`
7. 给 `generate_client.uc` 补最小回归样例
8. 在 LuCI JS 拆分稳定后，设计 `generate_client.uc` 的模块切分草图

## 9. 最终目标状态

重构完成后的理想状态不是“代码看起来更漂亮”，而是：

- 业务逻辑按职责分散到可读模块
- 高风险路径有自动化保护
- PR review 可以聚焦局部变更
- 新增协议字段或路由配置时，影响面可预测
- 出现问题时能快速定位到具体模块，而不是回到超长单文件里排查
