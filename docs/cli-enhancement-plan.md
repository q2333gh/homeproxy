# CLI 接口功能增强计划

基于对 HomeProxy 源码的调研：
1. **配置文件**: `/etc/config/homeproxy` (UCI 格式)
2. **RPC API**: `luci.homeproxy` (LuCI ucode)
3. **服务控制**: `/etc/init.d/homeproxy`

---

## 一、实际架构分析

### 1.1 HomeProxy 技术栈

| 组件 | 技术 | 位置 |
|------|------|------|
| 配置存储 | UCI (OpenWrt) | `/etc/config/homeproxy` |
| RPC 后端 | ucode | `/usr/share/rpcd/ucode/luci.homeproxy` |
| 前端 UI | JavaScript | `htdocs/luci-static/resources/` |
| 服务控制 | Shell | `/etc/init.d/homeproxy` |

### 1.2 已有的 RPC 方法

```javascript
// 文件: /usr/share/rpcd/ucode/luci.homeproxy
{
  acllist_read: { args: { type } },           // 读取ACL列表
  acllist_write: { args: { type, content } },  // 写入ACL列表
  certificate_write: { args: { filename } },  // 写入证书
  connection_check: { args: { site } },       // 连接测试 (baidu/google)
  log_clean: { args: { type } },              // 清理日志
  singbox_generator: { args: { type, params } }, // 生成密钥
  singbox_get_features: {},                    // 获取特性支持
  resources_get_version: { args: { type } },  // 获取资源版本
  resources_update: { args: { type } }        // 更新资源
}
```

### 1.3 UCI 配置结构

```
config homeproxy 'infra'      # 基础设施端口配置
config homeproxy 'config'     # 主配置 (主节点、路由模式等)
config homeproxy 'control'    # 访问控制
config homeproxy 'routing'   # 路由规则
config homeproxy 'dns'        # DNS 配置
config homeproxy 'subscription' # 订阅配置
config homeproxy 'server'     # 服务器模式
config homeproxy 'node'      # 节点配置 (多个)
```

---

## 二、CLI 实现方案

### 2.1 调用方式

#### 方式 A: UCI 命令 (推荐)

```bash
# 查看配置
uci show homeproxy
uci get homeproxy.config.main_node

# 修改配置
uci set homeproxy.config.main_node=node_name
uci commit homeproxy
/etc/init.d/homeproxy reload
```

#### 方式 B: LuCI RPC

```bash
# 需要先获取 session
luci -c /var/rpcd/lua -a login \
  -d '{"username":"root","password":"..."}' \
  -X call luci.homeproxy.connection_check \
  -d '{"site":"google"}'
```

#### 方式 C: 直接 HTTP (如果启用)

```bash
curl -s http://<router>/cgi-bin/luci/admin/homeproxy/status
```

### 2.2 命令设计

```
homeproxy-cli/
├── homeproxy          # 主命令
├── node/
│   ├── list          # 列出节点
│   ├── add          # 添加节点
│   ├── remove       # 删除节点
│   ├── test         # 测试节点
│   └── set-main     # 设置主节点
├── routing/
│   ├── get          # 获取路由模式
│   └── set          # 设置路由模式
├── dns/
│   ├── list         # 列出 DNS 服务器
│   └── set          # 设置 DNS
├── status/          # 状态查询
├── subscription/
│   ├── list         # 列出订阅
│   ├── add          # 添加订阅
│   ├── update       # 更新订阅
│   └── remove       # 删除订阅
└── control/
    ├── start        # 启动服务
    ├── stop         # 停止服务
    ├── restart      # 重启服务
    └── log          # 查看日志
```

---

## 三、核心命令实现

### 3.1 节点管理

```bash
# 列出所有节点
/homeproxy node list
# 输出:
# node1   1.2.3.4:443  vmess    [active]
# node2   5.6.7.8:443  trojan   [inactive]

# 设置主节点
/homeproxy node set-main node1

# 测试连接
/homeproxy node test node1
# 输出: ping: 120ms, download: 50Mbps
```

### 3.2 路由模式

```bash
# 获取当前路由模式
/homeproxy routing get
# bypass_mainland_china

# 设置路由模式
/homeproxy routing set proxy_all
# 可选: bypass_mainland_china, proxy_all, custom
```

### 3.3 服务控制

```bash
/homeproxy status
# HomeProxy: running (PID: 1234)
# Main node: node1
# Mode: bypass_mainland_china
# Uptime: 2h 30m

/homeproxy restart
# Restarting HomeProxy...
```

---

## 四、实施步骤

### Phase 1: 基础功能 (1-2天)

- [ ] 研究 `/etc/init.d/homeproxy` 脚本
- [ ] 实现 UCI 封装库
- [ ] 实现节点列表/测试命令

### Phase 2: 配置管理 (2-3天)

- [ ] 实现路由配置命令
- [ ] 实现 DNS 配置命令
- [ ] 实现订阅管理命令

### Phase 3: 增强功能 (2-3天)

- [ ] 实现批量导入/导出
- [ ] 实现自动测速
- [ ] 添加配置文件备份/恢复

---

## 五、注意事项

1. **权限**: 大部分操作需要 root 权限 (sudo)
2. **兼容性**: 不同 HomeProxy 版本 UCI 配置可能有差异
3. **热加载**: 修改配置后需要 `/etc/init.d/homeproxy reload`
4. **备份**: 重要操作前先备份 UCI 配置

---

## 六、参考资源

- HomeProxy 源码: `~/code/homeproxy/`
- UCI 文档: https://openwrt.org/docs/guide-user/base-system/uci
- LuCI RPC: https://github.com/openwrt/luci/wiki/RPC-API
