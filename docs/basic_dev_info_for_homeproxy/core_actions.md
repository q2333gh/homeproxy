从整个 repo 看，这个项目“才 <1w 行”，但真正关键、复杂度集中的几块其实很清晰，大致分三层：

### 1. 真正决定“行为”的核心

- **UCI → sing-box 配置生成链**（最核心）
  - `root/etc/homeproxy/scripts/generate_client.uc`  
    - 把 `homeproxy` 里的 `infra/config/control/routing/dns/node/...` 全部读出来，拼成一份完整的 `sing-box-c.json`：DNS、入站、出站、路由规则、rule_set 等都在这里决定。
  - `root/etc/homeproxy/scripts/generate_server.uc`  
    - 把 `server` 段转成 `sing-box-s.json` 的所有 inbounds。
  - 这两份 JSON 决定了 **“到底哪些流量、以什么协议、往哪走”**，是整个系统的 **行为中枢**。

- **防火墙与透明代理规则生成**（次核心，但对稳定性和可维护性影响极大）
  - `root/etc/homeproxy/scripts/firewall_post.ut`（+ `firewall_pre.uc`）  
    - 从 UCI 把 routing_mode / proxy_mode / ACL / 各种列表读出来，生成所有 nft 的 set 和 chain：DNS 劫持、TCP redirect、UDP tproxy、TUN 相关链，决定 **哪类流量被接管、如何打 mark、如何分流**。
  - 这部分是“**把 UCI 意图变成内核路由与 fw4 规则**”的关键，出错就不是“翻不出去”这么简单，而是整机网络行为跑偏。

- **订阅与配置迁移**
  - `root/etc/homeproxy/scripts/update_subscriptions.uc`  
    - 把各种订阅格式解析成 `node` 段、去重、过滤、自动切换主节点 —— 决定 **你实际有哪些出口、主线路是谁**。
  - `root/etc/homeproxy/scripts/migrate_config.uc`  
    - 负责从老版本 UCI 平滑迁到新结构，是升级后“不炸配置”的保障。

### 2. 编排和对外接口

- **服务编排 / 生命周期**
  - `root/etc/init.d/homeproxy`  
    - 读 UCI → 调生成脚本 → 起/停 sing-box 客户端与服务端 → 配 cron / dnsmasq / 路由 / fw4，决定 **什么时候生效、失败时怎么退回**。

- **RPC 服务 / LuCI 后端**
  - `root/usr/share/rpcd/ucode/luci.homeproxy`  
    - 暴露连通性测试、ACL 读写、证书写入、资源更新、sing-box feature 探测等 RPC，承接 LuCI 前端与底层脚本之间的桥梁。

### 3. UI 壳子

- **LuCI JS 视图**
  - `htdocs/luci-static/resources/view/homeproxy/*.js`、`homeproxy.js`  
    - 做表单、校验、调用 RPC、展示状态；重要但相对“可替代”，对系统行为的影响是**间接的**。

---

**总结一句话**：  
这个项目的关键价值，不在“有多少行 JS/TS”，而在那几份 **ucode/nft 模板 + init 脚本** 上——它们把 UCI 配置、订阅和 ACL 精准翻译成 sing-box JSON 和 nft 规则，决定了 **路由器在真实网络环境中的所有代理行为**。如果要关注“真正重要、改坏就会出大问题”的代码，就看：

- `generate_client.uc` / `generate_server.uc`  
- `firewall_post.ut` / `firewall_pre.uc`  
- `update_subscriptions.uc` / `migrate_config.uc`  
- `init.d/homeproxy` 和 `luci.homeproxy` RPC

其余文件更多是壳和胶水。