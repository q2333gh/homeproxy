
##   重要运行时状态 & 存储位置（唯一事实来源：源码）

uci配置默认值的代码库中位置: root/etc/config/homeproxy

> 本小节只根据本仓库源码与脚本整理 homeproxy 的内部运行时状态，不依赖外部文档。

- **UCI 持久配置（`/etc/config/homeproxy`）**
  - 定义所有业务/网络状态的“真相源”：主节点、路由模式、DNS 策略、订阅策略、服务端开关、日志级别等。
  - 关键段：
    - `infra`：端口、TUN 设备、mark、DNS 劫持等低层参数。
    - `config`：`main_node` / `main_udp_node`、`routing_mode`、`proxy_mode`、`routing_port`、`github_token`、`log_level` 等。
    - `dns`：`dns_strategy`、`default_server`、`disable_cache` 等。
    - `subscription`：`auto_update`、`filter_nodes`、`filter_keywords` 等。
    - `server`：`enabled`、`log_level`。

- **HomeProxy 工作目录（`HP_DIR=/etc/homeproxy`）**
  - 定义位置：`root/etc/homeproxy/scripts/homeproxy.uc` 与 `root/usr/share/rpcd/ucode/luci.homeproxy` 中的 `HP_DIR` 常量。
  - 主要子内容：
    - `scripts/`：所有核心脚本（生成配置、订阅更新、防火墙、迁移等）：
      - `generate_client.uc` / `generate_server.uc`：从 UCI 生成 `sing-box-c.json` / `sing-box-s.json` 所需的中间配置（运行时行为的直接来源）。
      - `firewall_pre.uc` / `firewall_post.ut`：根据 UCI 生成 `fw4_*.nft` 片段，决定哪些流量被重定向 / tproxy。
      - `update_subscriptions.uc`：拉取订阅、解析节点、写入 UCI，同时通过 `RUN_DIR/homeproxy.log` 记录订阅过程与错误。
      - `update_resources.sh`：更新 `resources/` 下的 GFW / China / proxy 列表，并在 `RUN_DIR/homeproxy.log` 中记录进度、错误与版本。
      - `migrate_config.uc`：对老版本 UCI 做一次性迁移（如补齐 `log_level`、修正 `routing_port` 语义）。
      - `clean_log.sh`：轮询清理 `/var/run/homeproxy/*.log`（最大大小、定期截断），保证日志不无限增长。
    - `resources/`：china/gfw/proxy 列表及其版本号：
      - `gfw_list.txt`、`china_list.txt`、`proxy_list.txt`：从远端拉取的域名列表，用于 DNSMasq / nft 分流。
      - `*.ver`：对应资源的最新版本号，由 `resources_update`（`luci.homeproxy` RPC + `update_resources.sh`）维护。
    - `certs/`：证书状态：
      - 通过 `luci.homeproxy.certificate_write` 写入 `client_ca.pem`、`server_publickey.pem`、`server_privatekey.pem`，作为 sing-box 服务端运行时依赖。
    - `ruleset/`（可选）：在路由模式为 `custom` 时由 init 脚本准备，用于自定义规则集。

- **运行时目录（`RUN_DIR=/var/run/homeproxy`）**
  - 定义位置：`root/etc/homeproxy/scripts/homeproxy.uc` 与 `root/etc/init.d/homeproxy` 中的 `RUN_DIR` 常量。
  - 由 init 脚本和各脚本在运行时创建，**不持久化**，但代表当前运行状态：
    - **sing-box 配置与日志**
      - `sing-box-c.json` / `sing-box-s.json`：客户端 / 服务端最终 JSON 配置文件，由 `generate_client.uc` / `generate_server.uc` 写入，init 脚本在启动前用 `sing-box check` 校验。
      - `sing-box-c.log` / `sing-box-s.log`：sing-box 实例运行时日志，init 脚本在启动时清空，`clean_log.sh` 负责大小控制。
      - `cache.db`：当路由模式为 `bypass_mainland_china` 或 `custom` 时，由 `generate_client.uc` 的 `experimental.cache_file` 配置启用；init 脚本在启动前保证文件存在，并在 ujail 时将其挂载为可写。
    - **HomeProxy 守护进程日志**
      - `homeproxy.log`：主守护进程与多脚本共享的日志：
        - init 脚本通过 `log()` 记录启停、错误与版本信息。
        - `update_subscriptions.uc` 与 `update_resources.sh` 通过 `RUN_DIR/homeproxy.log` 记录订阅与资源更新全过程。
      - `clean_log.sh` 根据大小定期截断 `homeproxy.log` 与 sing-box 日志。
    - **防火墙片段与路由状态**
      - `fw4_forward.nft` / `fw4_input.nft` / `fw4_post.nft`：
        - 路径在 `uci-defaults/luci-homeproxy` 中注册为 firewall4 `include path`。
        - 由 `firewall_pre.uc` 与 `firewall_post.ut` 生成，init 脚本在 `start_service` 中写入并执行 `fw4 reload`，在 `stop_service` 中清空并重新加载。
      - 相关 nft set / chain 由 init 脚本中的 `nft flush/delete` 管理，配合 `ip rule` / `ip route` / `ip tuntap` 反映“当前是否有透明代理/TUN”的状态。
    - **更新与资源缓存**
      - `update_resources-*.lock`：`update_resources.sh` 使用的锁文件，防止资源更新任务并发。
      - 临时下载的列表文件：先放在 `RUN_DIR/$listname`，校验后再移动到 `resources/` 并更新 `.ver`。

- **进程与守护（由 init 脚本 + procd 管理）**
  - `sing-box-c` / `sing-box-s`：以 procd 实例形式运行，配置与日志路径均来自 `RUN_DIR`；在支持时运行于 `ujail` 中，并挂载所需的 `RUN_DIR`、`HP_DIR/certs`、系统证书等。
  - `log-cleaner`：procd 管理的 `clean_log.sh` 循环脚本，代表日志状态维护的后台任务。
  - 这些进程是否存在、其所依赖的配置/日志文件是否生成成功，构成了 homeproxy 是否“真正在跑”的运行时状态。

- **cron 与自动更新状态**
  - 在 `config.subscription.auto_update=1` 时，init 脚本会在 `/etc/crontabs/root` 中添加/移除一行指向 `HP_DIR/scripts/update_crond.sh` 的任务（带 `#homeproxy_autosetup` 标记）。
  - 这行 cron 记录 + `subscription` 段配置 + `RUN_DIR/homeproxy.log` 里的订阅日志，**共同构成“订阅自动更新是否启用且工作正常”的状态视图**。

综上：**UCI 配置 (`/etc/config/homeproxy`) + 工作目录 (`/etc/homeproxy`) + 运行目录 (`/var/run/homeproxy`) + init/procd/nft/cron 组合起来，构成了 homeproxy 的全部内部状态管理面**。任何“HomeProxy 现在在干什么”的问题，都可以从这几处源码与文件中找到唯一事实来源。
