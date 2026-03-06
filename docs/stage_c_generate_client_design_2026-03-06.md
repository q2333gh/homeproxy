# Stage C 设计草图：`generate_client.uc` 拆分方案（2026-03-06）

## 1. 目标

本设计文档只解决一个问题：

如何在不破坏现有生成行为的前提下，把 `root/etc/homeproxy/scripts/generate_client.uc` 从单文件大对象拼装，拆成可局部审查、可逐步回归的生成链路。

本设计不追求：

- 一次性抽象出“完美通用框架”
- 和 `generate_server.uc` 做表面对称
- 同时重写 `update_subscriptions.uc`

## 2. 当前结构判断

`generate_client.uc` 当前约 975 行，真实结构不是“一个单函数”，而是“一个大脚本 + 若干 helper + 大量共享上下文变量”。

现有代码大致由五层组成：

1. UCI 读取与模式归一化
2. 局部解析 helper
   - `parse_port()`
   - `parse_dnsserver()`
   - `parse_dnsquery()`
3. 节点映射 helper
   - `generate_endpoint()`
   - `generate_outbound()`
4. 引用解析 helper
   - `get_outbound()`
   - `get_resolver()`
   - `get_ruleset()`
5. 顶层拼装
   - `config.dns`
   - `config.inbounds`
   - `config.endpoints` / `config.outbounds`
   - `config.route`
   - `config.experimental`

真正的问题不只是“文件长”，而是第 1 层构造出的隐式共享状态被第 3 / 4 / 5 层同时依赖。

## 3. 推荐拆分边界

### 3.1 第一层：`context`

职责：

- 读取 UCI
- 根据 `routing_mode` / `proxy_mode` 归一化默认值
- 产出显式上下文对象

最低应收敛的字段：

- `routing_mode`
- `proxy_mode`
- `ipv6_support`
- `main_node`
- `main_udp_node`
- `dedicated_udp_node`
- `default_outbound`
- `default_outbound_dns`
- `self_mark`
- `redirect_port`
- `tproxy_port`
- `tun_name` / `tun_addr4` / `tun_addr6` / `tun_mtu`
- `sniff_override`
- `dns_default_strategy`
- `dns_default_server`
- `udp_timeout`
- `direct_domain_list`
- `proxy_domain_list`

建议接口：

```ucode
function build_context(uci, ubus) => ctx
```

要求：

- 后续生成器不再直接读取顶层散落变量
- 模式分支收敛在这一层，不向下游扩散

### 3.2 第二层：`resolve`

职责：

- 负责所有“从 UCI 名称到 sing-box tag”的解析

最低应收敛的函数：

- `resolve_outbound_tag(ctx, cfg)`
- `resolve_dns_server_tag(ctx, cfg)`
- `resolve_ruleset_tags(ctx, cfg)`

这层的存在意义是把：

- `cfg -> outbound tag`
- `cfg -> resolver tag`
- `cfg -> ruleset tag`

从具体生成器里拿出来，避免 DNS / Route / Outbound 各自重复理解命名规则。

### 3.3 第三层：`parse`

职责：

- 只做局部字段解析，不关心全局模式

建议归入这一层的 helper：

- `parse_port()`
- `parse_dnsserver()`
- `parse_dnsquery()`

可新增的 helper：

- `parse_bool_flag()`
- `parse_time_or_null()`
- `parse_string_list_or_null()`

注意：

- 这一层不要碰 `uci`
- 这一层不要做 tag 解析
- 这一层不要写 `config`

### 3.4 第四层：`build`

职责：

- 根据 `ctx`、`resolve`、`parse` 输出 sing-box 片段

建议拆成：

- `build_dns(ctx, deps)`
- `build_inbounds(ctx, deps)`
- `build_outbounds(ctx, deps)`
- `build_endpoints(ctx, deps)`
- `build_route(ctx, deps)`
- `build_experimental(ctx)`

其中 `deps` 至少应包含：

- `resolve_outbound_tag`
- `resolve_dns_server_tag`
- `resolve_ruleset_tags`
- `generate_outbound`
- `generate_endpoint`

### 3.5 第五层：主入口

主入口只做：

1. `ctx = build_context(...)`
2. 初始化 `config`
3. 调用各 `build_*`
4. `removeBlankAttrs(config)`
5. `writefile(...)`

完成态下，主入口应明显短于当前脚本，不再包含大段业务分支。

## 4. 推荐落地顺序

### 第一步：先抽 `context`

这是风险最低、收益最高的一刀。

完成标志：

- 现有脚本仍是单文件
- 但所有顶层共享变量被组织到单一 `ctx`
- `config.dns` / `config.route` / `config.inbounds` 不再直接读散落全局变量

### 第二步：抽 `resolve`

完成标志：

- `get_outbound()` / `get_resolver()` / `get_ruleset()` 被统一收口
- 下游生成器不再理解 tag 拼接细节

### 第三步：抽 `build_inbounds()`

原因：

- 这是最小、最独立、最容易做等价验证的一块
- 当前也刚补了 `proxy_mode` 的最小护栏

### 第四步：抽 `build_dns()` 与 `build_route()`

原因：

- 这两块是最强耦合区
- 需要建立在 `ctx + resolve` 已稳定的基础上

### 第五步：抽 `build_outbounds()` / `build_endpoints()`

原因：

- 这里和节点协议映射紧耦合
- 应放在已有上下文和解析规则固定后再动

## 5. 不建议的拆法

### 不建议 1：先按文件物理大小拆

例如简单切成：

- `dns.uc`
- `route.uc`
- `outbound.uc`

但仍共享一堆隐式全局变量。

这会导致：

- 文件变多
- 依赖更隐蔽
- review 更难

### 不建议 2：先做“客户端/服务端对齐重构”

`generate_server.uc` 当前太小，不值得在这一阶段一起大拆。

### 不建议 3：先抽“通用 sing-box builder 框架”

当前仓库还没有稳定到值得发明一层框架。
先把 HomeProxy 自己的上下文和解析边界理顺，收益更直接。

## 6. 最小黄金样例矩阵

阶段 C 开始前，至少应固定以下样例：

1. `bypass_mainland_china + redirect_tproxy + main_node`
2. `bypass_mainland_china + dedicated main_udp_node`
3. `custom + redirect_tun + dns_server + routing_rule + ruleset`
4. `custom + tun + wireguard node`
5. `custom + urltest routing_node`
6. `custom + remote ruleset download_detour`

建议每个样例至少比较：

- `dns.servers`
- `dns.rules`
- `inbounds`
- `outbounds`
- `endpoints`
- `route.rules`
- `route.rule_set`
- `route.final`

## 7. 阶段 C 的完成定义

阶段 C 完成，不应只看“文件变多”或“代码更好看”，而应同时满足：

- 主入口明显变薄
- 隐式共享状态被显式 `ctx` 替代
- tag 解析规则集中
- 至少一组黄金样例能做前后对比
- review 能把问题定位到单一 builder 或 resolver 模块
