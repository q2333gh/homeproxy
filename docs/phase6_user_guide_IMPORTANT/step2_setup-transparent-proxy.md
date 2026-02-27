# HomeProxy 透明代理配置

简要说明如何让 HomeProxy 以透明代理方式运行，实现局域网设备无需配置即可走代理。

---

## 一、前置条件

- 已满足 [step1_prereq.md](step1_prereq.md) 的系统与软件包要求
- 已安装 `luci-app-homeproxy`
- 已准备节点来源（订阅或手动）及用户需提供项，见 [step1_prereq.md#六、用户需提供](step1_prereq.md#六用户需提供)

---

## 二、配置流程（简要）

1. **添加节点**：订阅链接或手动添加
2. **配置路由节点**：将代理节点与路由（如「代理」）关联；保留默认「直连」「封锁」节点
3. **配置规则集**（可选）：使用内置规则集或添加远程/本地规则集
4. **配置路由规则**：按顺序匹配，如：封锁 QUIC → 中国大陆/私网直连 → 其他走代理
5. **配置 DNS**：添加 DoH/DoT 服务器；**务必勾选「禁用 DNS 缓存」**
6. **保存并启动**：保存并应用，启动 HomeProxy

---

## 三、透明代理相关设置

| 项目 | 说明 |
|------|------|
| 路由模式 | 选「自定义路由模式」以使用规则集分流 |
| 代理模式 | 默认 TCP/UDP 全转发（TProxy + redirect），无需改 |
| 默认出站 | 未匹配规则时的出口；选「直连」或「代理」 |
| kmod-nft-tproxy | 透明代理依赖该内核模块（见 [step1_prereq](step1_prereq.md)） |

HomeProxy 通过 firewall4 下发 nftables 规则，将流量重定向到 sing-box，实现透明代理。

---

## 四、配置方式

- **纯 CLI**：见 [cli-user-guide.md](cli-user-guide.md)，使用 `homeproxy` 命令完成配置
- **Web 界面**：见 [OpenWrt 使用 Sing-Box 插件 Homeproxy 科学上网配置教程](../homeproxy_user_wizard_examaple_from_web_scrap.md)，含规则集 URL、自定义规则、DNS 等