# Go CLI 如何控制 HomeProxy —— 架构与原理

## 一、为什么 Go CLI 能控制 HomeProxy？

Go CLI **不是**直接控制 sing-box 或 HomeProxy 核心。它通过 **OpenWrt 已有的系统接口** 与 HomeProxy 交互，与 LuCI Web 界面使用完全相同的底层通道。

安装 HomeProxy 后，路由器上会部署：

| 组件 | 路径/对象 | 作用 |
|------|-----------|------|
| UCI 配置 | `/etc/config/homeproxy` | 存储节点、路由、DNS 等配置 |
| 服务脚本 | `/etc/init.d/homeproxy` | 启动/停止 sing-box，应用配置 |
| RPC 后端 | `ubus` 对象 `luci.homeproxy` | 实现资源管理、ACL、证书、连接检测等 |

Go CLI 通过 **shell 调用** 这三个接口：

```
homeproxy status  →  uci get / init.d status / ubus call luci.homeproxy singbox_get_features
homeproxy control start  →  /etc/init.d/homeproxy start
homeproxy node set-main X  →  uci set homeproxy.config.main_node=X && uci commit && init.d reload
```

也就是说：**Go CLI 是 UCI / init.d / ubus 的客户端**，与 LuCI Web UI 调用的是同一套接口。

---

## 二、Go CLI 架构

### 2.1 目录结构

```
cli-go/
├── cmd/homeproxy/           # 主程序
│   ├── main.go              # 入口、命令路由
│   ├── status.go            # status
│   ├── control.go           # control start/stop/restart
│   ├── log.go               # log [type] / log clean
│   ├── features.go          # features
│   ├── resources.go         # resources version/update
│   ├── acl.go               # acl list/write
│   ├── cert.go              # cert write
│   ├── generator.go         # generator uuid/reality-keypair/...
│   ├── node.go              # node list/test/set-main/add/remove/...
│   ├── routing.go           # routing get/set/set-node/rules/status
│   ├── dns.go               # dns get/set/set-china/test/cache/...
│   ├── subscription.go      # subscription list/add/remove/update/...
│   ├── args.go              # 参数解析 helpers
│   └── logging.go           # logInfo/logWarn
├── internal/system/         # 系统适配层
│   ├── exec.go              # runCommand (可注入，供测试 mock)
│   └── system.go            # CheckInstalled, UCI*, UBUSCall, Service*...
├── testutil/
│   └── mock.go              # 测试用 mock runner (LuCI API 契约)
└── go.mod
```

### 2.2 数据流与架构图

```
                         ┌─────────────────────────────────────────┐
                         │            homeproxy CLI                 │
                         │              (Go binary)                 │
                         └─────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────┼──────────────────────┐
                    │                      │                      │
                    ▼                      ▼                      ▼
         ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
         │  internal/system │  │  internal/system │  │  internal/system │
         │     UCIGet       │  │  UBUSCall(...)   │  │  ServiceStatus   │
         │     UCISet       │  │                  │  │  ServiceStart    │
         │     UCIShow      │  │                  │  │  ServiceReload   │
         └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
                  │                     │                     │
                  │    runCommand(name, args...)              │
                  └─────────────────────┼─────────────────────┘
                                       │
                                       ▼
                         ┌─────────────────────────────────────────┐
                         │           os/exec.Command                │
                         │    (uci | ubus | /etc/init.d/homeproxy)  │
                         └─────────────────┬───────────────────────┘
                                           │
         ┌─────────────────────────────────┼─────────────────────────────────┐
         │                                 │                                 │
         ▼                                 ▼                                 ▼
┌─────────────────┐            ┌─────────────────────┐            ┌─────────────────┐
│   uci get/set   │            │ ubus call           │            │ /etc/init.d/    │
│   show/commit   │            │ luci.homeproxy      │            │ homeproxy       │
└────────┬────────┘            └──────────┬──────────┘            └────────┬────────┘
         │                                │                                │
         ▼                                ▼                                ▼
┌─────────────────┐            ┌─────────────────────┐            ┌─────────────────┐
│ /etc/config/    │            │ rpcd luci.homeproxy │            │ sing-box        │
│ homeproxy       │            │ (资源/ACL/证书/     │            │ 进程 start/stop │
│                 │            │  连接检测/生成器)   │            │ reload          │
└─────────────────┘            └─────────────────────┘            └─────────────────┘
```

### 2.3 三大接口职责

| 接口 | 命令 | 职责 | 示例 |
|------|------|------|------|
| **UCI** | `uci get/set/show/add/delete/commit` | 读写 `/etc/config/homeproxy` | 节点、路由模式、DNS、订阅 |
| **ubus** | `ubus call luci.homeproxy <method> '<params>'` | 调用 LuCI RPC | 资源版本/更新、ACL、证书、连接检测、密钥生成、日志清理 |
| **init.d** | `/etc/init.d/homeproxy start|stop|restart|reload|status` | 控制 sing-box 进程 | 启动、停止、重载配置 |

### 2.4 命令到接口映射

| CLI 命令 | 主要使用接口 |
|----------|--------------|
| `status` | init.d status, uci get, ubus singbox_get_features |
| `control start/stop/restart` | init.d |
| `log [type]` | 直接读 `/var/run/homeproxy/<type>.log` |
| `log clean [type]` | ubus log_clean |
| `features` | ubus singbox_get_features |
| `resources version/update` | ubus resources_get_version / resources_update |
| `acl list/write` | ubus acllist_read / acllist_write |
| `cert write` | 文件拷贝 + ubus certificate_write |
| `generator uuid/...` | ubus singbox_generator |
| `node list/test/set-main/add/...` | uci + (test 时) ubus connection_check |
| `routing get/set/set-node/rules` | uci |
| `dns get/set/set-china/...` | uci |
| `subscription list/add/remove/...` | uci (+ 更新脚本) |

---

## 三、总结

- Go CLI 是 **OpenWrt 系统接口的客户端**，不直接操作 sing-box。
- 控制链路：`Go CLI → os/exec → uci | ubus | init.d → 配置/ RPC / sing-box`。
- 设计原则：薄适配层 + 显式 shell 调用，逻辑清晰，易于测试（通过 mock `runCommand`）。
