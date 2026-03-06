# HomeProxy 全库 Go 重写可行性复核（第一性原理，2026-03-06）

## 1. 结论先行

如果只从软件工程第一性原理出发，而不考虑“个人语言偏好”，整个代码库里**真正适合用 Go 重写的，不是所有复杂代码，而是那些同时满足以下条件的部分**：

1. 业务规则相对稳定
2. 输入输出边界清晰
3. 逻辑主要是纯数据变换，而不是 OpenWrt 平台胶水
4. 可以在宿主机或 CI 中脱离真实路由器运行测试
5. 重写后不会显著增加与 `uci` / `ubus` / `rpcd` / `procd` / `fw4` 的适配成本

按这个标准，当前代码库可分成三类：

- **适合重写为 Go**：分享链接解析、订阅解析与规范化、部分配置模型与 JSON 生成内核、资源/规则元数据处理、命令行/自动化入口
- **只适合部分下沉到 Go**：`generate_client.uc` / `generate_server.uc` 的纯映射与装配逻辑、`luci.homeproxy` 的部分纯业务方法
- **不适合或现阶段不值得重写为 Go**：LuCI 前端、`init.d` 服务编排、fw4/nft 模板生成、UCI migration、OpenWrt 安装与打包脚本

更直接地说：

- **最值得继续用 Go 扩张的，是“纯业务核心”**
- **最不值得碰的，是“OpenWrt 平台胶水层”**

## 2. 判断标准

### 2.1 什么叫“适合 Go”

一个模块适合 Go，不是因为 Go 更快，而是因为它具备：

- 明确的数据结构
- 显式错误处理收益高
- 单元测试天然容易
- 与 OS/平台的耦合可以被压缩到很薄的适配层

### 2.2 什么叫“不适合 Go”

一个模块不适合 Go，通常不是因为 Go 做不到，而是因为：

- 它本质上是 OpenWrt 运行时编排
- 它直接依赖 `procd`、`/etc/init.d`、`dnsmasq`、`fw4`、`nft`
- 它的价值主要来自“贴平台”，不是来自算法复杂度
- 重写后仍然要回到 shell / ucode / ubus，收益不抵风险

## 3. 当前代码库分层

按职责看，当前仓库大致有 6 层：

1. **LuCI 前端层**
   - `htdocs/luci-static/resources/view/homeproxy/*.js`
   - `htdocs/luci-static/resources/homeproxy*.js`
2. **RPC 后端层**
   - `root/usr/share/rpcd/ucode/luci.homeproxy`
3. **配置生成层**
   - `root/etc/homeproxy/scripts/generate_client.uc`
   - `root/etc/homeproxy/scripts/generate_server.uc`
4. **订阅/迁移/辅助脚本层**
   - `update_subscriptions.uc`
   - `migrate_config.uc`
   - `homeproxy.uc`
   - 若干 shell 脚本
5. **运行时编排层**
   - `root/etc/init.d/homeproxy`
   - `firewall_pre.uc`
   - `firewall_post.ut`
6. **Go CLI 层**
   - `cli-go/`

其中真正的核心复杂度主要集中在第 2、3、4、5 层，不在 LuCI 表单本身。

## 4. 适合重写为 Go 的部分

### 4.1 分享链接解析

对应代码：

- LuCI JS：`htdocs/luci-static/resources/homeproxy/node_parser.js`
- CLI Go：`cli-go/cmd/homeproxy/sharelink.go`
- 订阅脚本：`root/etc/homeproxy/scripts/update_subscriptions.uc`

判断：**强适合**

原因：

- 这是典型的纯字符串到结构体映射问题
- 协议种类虽然多，但边界稳定
- 错误处理、字段校验、归一化都适合用 Go struct + parser 拆解
- 可以在非 OpenWrt 环境中大量做表驱动测试

结论：

- 这一块最值得收敛到单一 Go 实现，再由 LuCI / RPC / CLI 复用
- 当前仓库实际上已经有一部分 Go 版 parser；继续强化这条路线是合理的

### 4.2 订阅解析与节点规范化

对应代码：

- `root/etc/homeproxy/scripts/update_subscriptions.uc`
- `cli-go/cmd/homeproxy/subscription.go`

判断：**强适合**

原因：

- 核心问题是“订阅内容解析 -> 节点对象规范化 -> 过滤 -> 写入 UCI”
- 真正适合 Go 的部分是前半段：抓取响应、解码、解析、过滤、去重、归一化
- 这些逻辑天然需要更强的错误处理和更高的可测试性
- 当前 `update_subscriptions.uc` 约 669 行，已经说明它承载了不小的纯业务复杂度

结论：

- 订阅获取、解析、过滤、节点规范化，非常适合做成 Go 核心
- 最后“写回 UCI / 触发 reload”仍可以保留在薄适配层

### 4.3 sing-box 配置模型与 JSON 装配内核

对应代码：

- `root/etc/homeproxy/scripts/generate_client.uc`
- `root/etc/homeproxy/scripts/generate_server.uc`

判断：**部分强适合**

原因：

- `generate_client.uc` 的高复杂度部分，本质上是：
  - UCI 配置读取
  - 模式归一化
  - 节点/规则映射
  - 组装 sing-box JSON
- 其中“读取 UCI”与“最后写文件”是平台适配
- 真正适合 Go 的，是中间那层“领域模型 -> JSON config”

结论：

- **不建议把整个 `generate_client.uc` 原样搬去 Go**
- **建议只把中间的纯映射内核重写为 Go**
- 也就是：
  - Go：`ConfigContext -> sing-box config object`
  - ucode/shell：读取 UCI、调用 Go、写文件、与 init.d 集成

这是一个典型的“内核下沉到 Go，边缘仍留在 OpenWrt 原生层”的问题。

### 4.4 资源/规则元数据处理

对应代码：

- `update_resources.sh`
- `resources_get_version` / `resources_update`
- 各 `.ver` 文件与资源更新逻辑

判断：**适合**

原因：

- 这类逻辑本质上是下载、校验、版本比较、文件替换
- Go 更适合处理网络 IO、超时、重试、哈希、结构化错误
- shell 在这里更像“能做”，不是“擅长做”

结论：

- 资源更新器可以考虑逐步 Go 化
- 但最终与 OpenWrt 包和文件布局的接线，仍要保留薄平台层

### 4.5 自动化入口与无头操作界面

对应代码：

- `cli-go/`

判断：**已经在正确方向上**

原因：

- CLI 的本质就是 automation surface
- Go 在这里天然优于 shell 和 LuCI JS
- 这也是当前仓库最接近“可持续工程化”的部分

结论：

- 继续扩张 Go CLI 是正确的
- 但不要把它理解成“把所有逻辑都搬到 Go”
- 它应该优先承接：
  - share link / subscription 解析
  - 配置审计
  - dry-run / diff
  - 机器可调用的 JSON 输出

## 5. 只适合部分下沉到 Go 的部分

### 5.1 `luci.homeproxy` RPC 后端

对应代码：

- `root/usr/share/rpcd/ucode/luci.homeproxy`

判断：**部分适合，整体不适合直接替换**

原因：

- 这里混合了两类东西：
  - 纯业务方法：ACL 文件读写、证书内容校验的一部分、资源元数据获取
  - 平台方法：调用 `sing-box`、操作临时文件、通过 rpcd/ubus 暴露能力
- 真正的 rpcd 接口面仍然深度耦合 OpenWrt 的 `rpcd`

结论：

- 不建议直接把整个 `luci.homeproxy` 改写成 Go daemon 去替代 rpcd ucode
- 但可以让其中某些重逻辑调用 Go 子程序或 Go 库

### 5.2 证书/密钥/生成器能力

对应代码：

- `certificate_write`
- `singbox_generator`

判断：**部分适合**

原因：

- PEM 校验、内容规范化、生成器输出解析，这些都更适合 Go
- 但“作为 rpcd 方法暴露给 LuCI”和“与文件路径约定对接”仍是平台边界

结论：

- 适合把核心校验与解析收敛到 Go
- 不适合先把暴露方式整体替换

## 6. 不适合或现阶段不值得重写为 Go 的部分

### 6.1 LuCI 前端

对应代码：

- `htdocs/luci-static/resources/view/homeproxy/*.js`

判断：**不适合**

原因：

- 这些文件本质是 LuCI 页面装配和表单定义
- 运行环境就是 LuCI JS，不是 Go
- 即便把一部分逻辑改成 Go，最后仍然要经由 LuCI / RPC 展示回来
- 重写为 Go 不会减少系统复杂度，只会增加跨层跳转

结论：

- 前端层应该继续做“减重”和“模块化”
- 不是 Go 化

### 6.2 `init.d` 服务编排

对应代码：

- `root/etc/init.d/homeproxy`

判断：**不适合**

原因：

- 这层的本质是 OpenWrt 服务编排
- 它要和 `procd`、`dnsmasq`、`ip rule`、`ip route`、`tuntap`、`ujail`、包安装布局直接交互
- 这是平台原生胶水，不是纯业务内核

结论：

- 不应试图用 Go 取代 `init.d` 主体
- 顶多把某些复杂计算下沉到 Go 子命令，再由 `init.d` 调用

### 6.3 fw4 / nft 模板与防火墙生成

对应代码：

- `root/etc/homeproxy/scripts/firewall_post.ut`
- `root/etc/homeproxy/scripts/firewall_pre.uc`

判断：**不适合**

原因：

- 这部分本质上是 fw4 / nft 生态内的模板生成
- 与 OpenWrt 官方路径、include 机制、nft 语义深度绑定
- 即便用 Go 生成字符串，也仍然要回到 fw4 的世界

结论：

- 这部分更值得做的是“按职责拆模板片段”
- 不是 Go 重写

### 6.4 UCI migration

对应代码：

- `root/etc/homeproxy/scripts/migrate_config.uc`

判断：**不适合**

原因：

- migration 的生命周期短、平台绑定强、依赖 UCI 原地修改
- 用 Go 重写不会显著提升长期收益

结论：

- 保持在 ucode 更合理

### 6.5 打包、安装、CI 周边 shell

对应代码：

- `.github/build-ipk.sh`
- `.github/build-cli-pkg.sh`
- `update_resources.sh`
- 若干安装脚本

判断：**大多不值得**

原因：

- 它们主要是构建和包布局胶水
- 重写为 Go 会增加分发和维护复杂度
- 除非脚本本身已经演化成复杂业务逻辑，否则收益不高

## 7. 最合理的 Go 化路线

如果从今天开始，按收益/风险比排序，最值得做的 Go 化顺序应该是：

1. **统一分享链接解析核心**
   - 让 Go 成为 single source of truth
2. **把订阅解析/过滤/节点规范化下沉到 Go**
3. **把 `generate_client` 的纯配置装配内核下沉到 Go**
   - 保留 UCI 读取与 OpenWrt 接线在原生层
4. **把资源更新器中复杂网络/校验逻辑下沉到 Go**
5. **让 RPC/CLI/LuCI 通过薄适配层复用这些 Go 能力**

而最不该做的顺序是：

1. 先重写 LuCI
2. 先重写 `init.d`
3. 先重写 fw4/nft 模板
4. 为了“统一语言栈”而整体搬迁到 Go

## 8. 推荐的目标架构

更合理的终态不是“全 Go”，而是：

- **Go**
  - 纯业务核心
  - parser / normalizer / config assembler / resource updater
- **ucode / shell**
  - OpenWrt 平台适配层
  - UCI / ubus / rpcd / init.d / fw4 接线
- **LuCI JS**
  - 视图与交互装配

也就是：

**Go 负责“算什么”**

**OpenWrt 原生层负责“在系统里怎么接”**

## 9. 最终判断

如果只允许一句话总结：

**HomeProxy 不适合做“全库 Go 重写”，但非常适合把“纯业务核心”系统性下沉到 Go。**

当前最值得下沉的核心是：

- 分享链接解析
- 订阅解析与规范化
- `generate_client.uc` 的中间配置装配内核
- 资源更新中的网络与校验逻辑

当前最不值得碰的核心是：

- LuCI 页面层
- `init.d` 服务编排
- fw4/nft 模板层
- migration 与打包胶水
