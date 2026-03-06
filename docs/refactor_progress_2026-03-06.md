# HomeProxy 重构进度（2026-03-06）

## 1. 当前进度摘要

当前分支：`refactor/luci-js-phase-b`

截至 2026-03-06，本轮重构已经完成以下阶段：

- 阶段 B：LuCI JS 拆分
- 阶段 B.5：针对阶段 B 的第一性原理复核收尾
- 阶段 A：`generate_client.uc` 已发现高风险条件分支缺陷修复
- 阶段 E（最小护栏部分）：Go 单测与 JS/ucode 最小回归已接入 CI

近期关键提交：

1. `b564416 refactor(luci): finish phase b review follow-ups`
2. `098463d refactor(luci): split node helpers and add js regression tests`
3. `78e3926 test: cover generate client proxy mode guards`

## 2. 已完成事项

### 2.1 LuCI JS 阶段

已完成的核心动作：

- 将 `view/homeproxy/client.js` 中重复的状态查询、DNS 校验、ACL 域名列表读写、重复 option loader 收敛到 `homeproxy/client.js`
- 将 `view/homeproxy/node.js` 中分享链接解析、导入流程、TLS/transport/wireguard/mux/协议字段组等重块拆出
- 将 `homeproxy/node.js` 进一步拆分为：
  - `homeproxy/node_parser.js`
  - `homeproxy/node_import.js`
  - `homeproxy/node.js` 仅作为聚合导出入口

阶段 B.5 的结果：

- `client` 侧已不再依赖低语义的页面内联 `load()` 模板
- `node` 侧导入流程已从单一大函数拆成 parser / importer / UI 装配三层
- 为 LuCI JS 中心 helper 补了最小 Node 回归样例

### 2.2 运行时配置生成止血

已完成的核心动作：

- 修复 `root/etc/homeproxy/scripts/generate_client.uc` 中两个明确错误的条件判断：
  - `match(proxy_mode), /tproxy/`
  - `match(proxy_mode), /tun/`
- 新增 `test/ucode/generate_client.test.mjs`，对 `redirect` / `tproxy` / `tun` 分支与错误写法进行最小回归保护

### 2.3 CI 最小闸门

已完成的核心动作：

- 在 `.github/workflows/build-ipk.yml` 中加入：
  - `cd cli-go && go test ./...`
  - `node --test test/**/*.test.mjs`
- 将 `test/**` 纳入 workflow path 触发范围

## 3. 当前可重复验证结果

本地已通过：

- `cd cli-go && go test ./...`
- `node --test test/**/*.test.mjs`
- `git diff --check`
- 多个 LuCI JS 文件的 `node --check`

当前最小回归覆盖点包括：

- LuCI JS 语义化 loader
- DNS server 校验行为
- 分享链接 parser 的 VMess / Shadowsocks / feature gate 场景
- 节点导入默认值与去重流程
- `generate_client.uc` 的 `proxy_mode` 条件分支护栏

## 4. 阶段 C 复核（第一性原理）

### 4.1 结论

阶段 C 的方向是对的，但按当前计划文本直接执行，仍然有三个结构性风险：

1. 计划把拆分重点写成 “DNS / Outbound / Route / 最终 JSON”，但遗漏了最关键的前置层：上下文归一化与符号解析
2. 计划要求 `generate_server.uc` 与 `generate_client.uc` 对齐组织方式，这在第一性原理上不成立，属于过度追求表面对称
3. 计划的验收标准里“核心路径等价”仍然太模糊，如果没有更明确的黄金样例与输出对比，阶段 C 很容易变成高风险结构搬家

### 4.2 主要发现

#### 发现 1：阶段 C 的第一刀不应该直接切 DNS / Outbound / Route

原因：

- 当前 `generate_client.uc` 的真实耦合核心不在输出块本身，而在文件前半段那批跨区域共享状态：
  - `routing_mode`
  - `proxy_mode`
  - `main_node` / `main_udp_node`
  - `dns_default_server`
  - `self_mark` / `redirect_port` / `tproxy_port`
  - `sniff_override`
  - `default_outbound` / `default_outbound_dns`
- 这些值先被按 UCI 和模式条件归一化，然后同时被 DNS / inbound / outbound / route 多处消费
- 如果不先抽“上下文构建层”，直接把输出块拆文件，只会把共享隐式状态扩散到更多模块里

结论：

阶段 C 的第一步必须改成：

1. UCI 读取与上下文归一化
2. 名称解析器与引用解析器
3. DNS / inbound / outbound / route 生成器
4. 最终装配与写出

这里的“名称解析器与引用解析器”至少应包括：

- `get_outbound()`
- `get_resolver()`
- `get_ruleset()`
- 端口 / DNS query / DNS server 解析 helper

#### 发现 2：不应该在同一阶段强行让 `generate_server.uc` 与 `generate_client.uc` 完全对齐

原因：

- `generate_client.uc` 当前约 975 行，复杂度主要来自模式分支、规则构建和节点映射
- `generate_server.uc` 当前约 185 行，复杂度和风险等级明显低一个数量级
- 如果为了“结构统一”而把 server 生成器也一起做同样力度的拆分，收益很小，反而会扩大改动面

结论：

- 阶段 C 的主体应只针对 `generate_client.uc`
- `generate_server.uc` 只应复用真正稳定、低耦合的 helper
- 不要把“文件形态一致”当作目标，只把“共享不变量一致”当作目标

#### 发现 3：阶段 C 还缺少足够明确的等价性契约

原因：

- 目前阶段 A 只补了 `proxy_mode` 条件分支的最小护栏
- 但阶段 C 一旦开始拆 `generate_client.uc`，真正高风险的是“同一套 UCI 输入下，生成 JSON 是否保持一致”
- 如果只说“核心路径上与旧逻辑等价”，review 时没有可落地判据

结论：

阶段 C 开工前，必须先固定最小黄金样例集，并把输出对比定义清楚。至少应覆盖：

1. `bypass_mainland_china + redirect_tproxy`
2. `custom + redirect_tun`
3. `custom + tun`
4. `custom + urltest/routing_node/dns_server/ruleset`
5. 至少一个 `wireguard` 或 `tuic/vless/vmess` 节点映射场景

验收方式不应只看“脚本能运行”，而应看：

- 旧输出与新输出在关键字段上是否一致
- 新增模块是否仍遵守原有引用解析规则
- 错误定位是否能收缩到单一模块

### 4.3 对阶段 C 的修正版建议

建议把阶段 C 改成以下顺序：

1. 先抽 `context` 层
   - 负责 UCI 读取、模式判定、默认值归一化
2. 再抽 `resolve` 层
   - 负责 outbound / resolver / ruleset tag 解析
3. 再抽 `parse` 层
   - 负责 port / dns server / query 等局部解析
4. 然后拆生成器
   - `buildDNS()`
   - `buildInbounds()`
   - `buildEndpoints()`
   - `buildOutbounds()`
   - `buildRoute()`
5. 最后保留一个极薄主入口
   - 聚合 config
   - `removeBlankAttrs()`
   - `writefile()`

### 4.4 修正版验收标准

阶段 C 真正完成，应满足：

- `generate_client.uc` 主入口显著变薄，只负责装配
- 隐式共享状态被收敛到显式 `context`
- tag / resolver / ruleset 解析规则集中在单一层，而不是散落在各生成器中
- 至少有一组黄金样例可以对比生成 JSON
- `generate_server.uc` 没有被为了“统一风格”而进行不必要的大拆分

## 5. 下一步建议

当前最合理的下一步，不是直接开始横向拆所有生成块，而是：

1. 先为阶段 C 设计 `context + resolve + parse + build` 的模块边界草图
2. 先固定黄金样例输入输出
3. 在样例护栏下再开始拆 `generate_client.uc`

否则，阶段 C 很容易从“降低复杂度”滑向“把复杂度重新分布到更多文件”。
