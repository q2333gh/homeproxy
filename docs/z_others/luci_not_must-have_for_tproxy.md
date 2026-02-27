
从第一性原理看，可以这样理解：

---

## 结论：透明代理的核心链路不依赖 LuCI Web UI

**核心链路：**

1. **配置**：UCI（`/etc/config/homeproxy`）— 可用 `uci` 或 Go CLI 编辑
2. **生成配置**：`generate_client.uc` — 读 UCI、写 sing-box JSON
3. **编排**：`/etc/init.d/homeproxy` — 调用 ucode、起 sing-box、配 dnsmasq、下发防火墙规则
4. **代理执行**：sing-box + firewall4 + kmod-nft-tproxy + dnsmasq

从源码看，`generate_client.uc` 里：

```12:23:root/etc/homeproxy/scripts/generate_client.uc
import { connect } from 'ubus';
...
const ubus = connect();
/* const features = ubus.call('luci.homeproxy', 'singbox_get_features') || {}; */
...
let wan_dns = ubus.call('network.interface', 'status', {'interface': 'wan'})?.['dns-server']?.[0];
```

- 实际只用了 **`network.interface`**（标准 ubus）
- `luci.homeproxy singbox_get_features` 被注释掉，当前未参与生成客户端配置

所以，对「只用手动节点 + 预置资源文件」的透明代理来说，LuCI Web 和 `luci.homeproxy` 都不是必需，仅依赖 UCI、ucode 脚本和 init.d 即可。

---

## 哪些功能才需要 luci.homeproxy RPC？

| 能力                                    | 是否依赖 luci.homeproxy RPC              |
| --------------------------------------- | ---------------------------------------- |
| 手动节点 + 生成配置                     | ❌ 不需要                                 |
| init.d 起停、dnsmasq、防火墙            | ❌ 不需要                                 |
| 订阅解析（`update_subscriptions.uc`）   | ✅ 需要（调用 `singbox_get_features` 等） |
| 规则集更新（china_ip4、gfw_list 等）    | ✅ 需要（`resources_update`）             |
| 连接测试、ACL、证书、密钥生成、日志清理 | ✅ 需要（对应 RPC 方法）                  |

---

## 分层视角

| 层次               | 透明代理核心           | 是否依赖 LuCI                               |
| ------------------ | ---------------------- | ------------------------------------------- |
| 配置入口           | UCI                    | ❌ 任何 UCI 客户端（uci CLI、Go CLI 等）即可 |
| 配置生成           | ucode 脚本 + 标准 ubus | ❌ 不依赖 luci.homeproxy                     |
| 服务编排           | init.d + procd         | ❌ 不依赖 LuCI                               |
| 订阅/规则集/测试等 | luci.homeproxy RPC     | ✅ 这些增强功能才依赖 LuCI 后端              |

---

**总结**：  
透明代理的核心能力（UCI → ucode → sing-box → firewall + dnsmasq）可以在**不使用 LuCI Web 界面**的前提下工作，配置方式可以是纯 UCI / Go CLI。  
LuCI Web 和 `luci.homeproxy` RPC 主要用于订阅、规则集更新、连接测试等增强功能，不是透明代理核心链路的前提条件。