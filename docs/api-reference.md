# HomeProxy 用户侧 API 文档

本文档列出 HomeProxy 提供的所有用户侧 API 端点。

---

## 一、RPC API

HomeProxy 通过 LuCI RPC 提供 API 服务，对象名为 `luci.homeproxy`。

### 1.1 调用方式

**通过 ubus 调用**:
```bash
ubus call luci.homeproxy <method> '<json_params>'
```

**通过 HTTP 调用** (需要 LuCI session):
```bash
# 先获取 session
luci -c /var/rpcd/lua -a login \
  -d '{"username":"root","password":"your_password"}'

# 然后调用 RPC
curl -b "sysauth=..." http://<router>/cgi-bin/luci/admin/homeproxy/status \
  -X POST -d '{"jsonrpc":"2.0","id":1,"method":"call","params":["<session>","luci.homeproxy","<method>",<params>]}' 
```

### 1.2 可用方法

#### 连接检测

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `connection_check` | `site: string` | `{result: boolean}` | 检测到网站的连接 |

```bash
# 示例
ubus call luci.homeproxy connection_check '{"site":"google"}'
# 返回: { "result": true }

ubus call luci.homeproxy connection_check '{"site":"baidu"}'
# 返回: { "result": true }
```

#### 资源管理

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `resources_get_version` | `type: string` | `{version: string, error: string}` | 获取资源版本 |
| `resources_update` | `type: string` | `{status: number}` | 更新资源 |

```bash
# 获取版本
ubus call luci.homeproxy resources_get_version '{"type":"china_ip4"}'
# 返回: { "version": "2024-01-01", "error": null }

# 更新资源
ubus call luci.homeproxy resources_update '{"type":"gfw_list"}'
# 返回: { "status": 0 }  (0=成功, 1=失败, 2=正在更新, 3=已是最新)
```

支持的资源类型:
- `china_ip4` - 中国 IPv4 列表
- `china_ip6` - 中国 IPv6 列表
- `china_list` - 中国域名列表
- `gfw_list` - GFW 列表

#### ACL 列表管理

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `acllist_read` | `type: string` | `{content: string}` | 读取 ACL 列表 |
| `acllist_write` | `type, content` | `{result: boolean}` | 写入 ACL 列表 |

```bash
# 读取直连列表
ubus call luci.homeproxy acllist_read '{"type":"direct_list"}'

# 读取代理列表
ubus call luci.homeproxy acllist_read '{"type":"proxy_list"}'
```

支持的列表类型:
- `direct_list` - 直连域名/IP
- `proxy_list` - 代理域名/IP

#### 证书管理

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `certificate_write` | `filename: string` | `{result: boolean, error: string}` | 写入证书 |

```bash
# 写入证书 (需先上传到 /tmp/homeproxy_certificate.tmp)
ubus call luci.homeproxy certificate_write '{"filename":"client_ca"}'
```

支持的证书文件:
- `client_ca` - 客户端 CA 证书
- `server_publickey` - 服务器公钥
- `server_privatekey` - 服务器私钥

#### sing-box 工具

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `singbox_generator` | `type: string, params: string` | `{result: object}` | 生成密钥对 |
| `singbox_get_features` | - | `{result: object}` | 获取特性支持 |

```bash
# 生成 UUID
ubus call luci.homeproxy singbox_generator '{"type":"uuid"}'
# 返回: { "result": { "uuid": "..." } }

# 生成 Reality 密钥对
ubus call luci.homeproxy singbox_generator '{"type":"reality-keypair"}'
# 返回: { "result": { "private_key": "...", "public_key": "..." } }

# 生成 WireGuard 密钥对
ubus call luci.homeproxy singbox_generator '{"type":"wg-keypair"}'

# 获取特性
ubus call luci.homeproxy singbox_get_features {}
# 返回: { "result": { "version": "1.9.0", "with_quic": true, "with_grpc": true, ... } }
```

支持的生成类型:
- `ech-keypair` - ECH 密钥对
- `uuid` - UUID
- `reality-keypair` - Reality 密钥对
- `vapid-keypair` - VAPID 密钥对
- `wg-keypair` - WireGuard 密钥对

#### 日志管理

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `log_clean` | `type: string` | `{result: boolean}` | 清理日志 |

```bash
ubus call luci.homeproxy log_clean '{"type":"homeproxy"}'
ubus call luci.homeproxy log_clean '{"type":"sing-box-c"}'
ubus call luci.homeproxy log_clean '{"type":"sing-box-s"}'
```

---

## 二、UCI 配置 API

HomeProxy 使用 UCI (Unified Configuration Interface) 存储配置。

### 2.1 配置文件位置

```
/etc/config/homeproxy
```

### 2.2 UCI 命令行操作

```bash
# 查看所有配置
uci show homeproxy

# 查看特定配置节
uci get homeproxy.config.main_node
uci get homeproxy.config.routing_mode

# 修改配置
uci set homeproxy.config.main_node=node_name
uci set homeproxy.config.routing_mode=bypass_mainland_china

# 提交并生效
uci commit homeproxy
/etc/init.d/homeproxy reload
```

### 2.3 配置节结构

#### config homeproxy 'infra' - 基础设施

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `common_port` | string | `22,53,80,443,...` | 常用端口 |
| `mixed_port` | number | 5330 | HTTP/SOCKS 混合端口 |
| `redirect_port` | number | 5331 | HTTP 代理端口 |
| `tproxy_port` | number | 5332 | TProxy 端口 |
| `dns_port` | number | 5333 | DNS 端口 |
| `tun_name` | string | `singtun0` | TUN 接口名 |
| `tun_addr4` | string | `172.19.0.1/30` | IPv4 地址 |
| `tun_addr6` | string | `fdfe:dcba:9876::1/126` | IPv6 地址 |
| `tun_mtu` | number | 9000 | MTU |

#### config homeproxy 'config' - 主配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `main_node` | string | - | 主节点名称 |
| `main_udp_node` | string | `same` | UDP 主节点 |
| `dns_server` | string | `8.8.8.8` | DNS 服务器 |
| `china_dns_server` | string | `223.5.5.5` | 中国 DNS |
| `routing_mode` | string | `bypass_mainland_china` | 路由模式 |
| `routing_port` | string | `common` | 路由端口 |
| `proxy_mode` | string | `redirect_tproxy` | 代理模式 |
| `ipv6_support` | number | 1 | IPv6 支持 |
| `log_level` | string | `warn` | 日志级别 |

路由模式选项:
- `bypass_mainland_china` - 绕过中国大陆
- `proxy_mainland_china` - 代理中国大陆
- `proxy_all` - 全代理
- `direct_all` - 全直连
- `custom` - 自定义

#### config homeproxy 'routing' - 路由规则

| 选项 | 类型 | 说明 |
|------|------|------|
| `sniff_override` | number | 覆盖嗅探 |
| `default_outbound` | string | 默认出站 |
| `default_outbound_dns` | string | 默认 DNS 出站 |

#### config homeproxy 'dns' - DNS 配置

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `dns_strategy` | string | `prefer_ipv4` | DNS 策略 |
| `default_server` | string | `local-dns` | 默认服务器 |
| `disable_cache` | number | 0 | 禁用缓存 |

#### config homeproxy 'subscription' - 订阅

| 选项 | 类型 | 说明 |
|------|------|------|
| `auto_update` | number | 自动更新 |
| `subscription_url` | list | 订阅地址列表 |
| `filter_keywords` | list | 过滤关键词 |
| `user_agent` | string | 用户代理 |

#### config homeproxy 'node' - 节点 (多个)

| 选项 | 类型 | 说明 |
|------|------|------|
| `type` | string | 节点类型 (vmess/vless/trojan/shadowsocks/hysteria2/...) |
| `label` | string | 节点标签 |
| `address` | string | 服务器地址 |
| `port` | number | 端口 |
| `uuid` | string | UUID (VMess/VLESS) |
| `password` | string | 密码 |
| `tls` | number | 是否启用 TLS |

---

## 三、服务控制

### 3.1 启动/停止/重启

```bash
/etc/init.d/homeproxy start
/etc/init.d/homeproxy stop
/etc/init.d/homeproxy restart
/etc/init.d/homeproxy reload
```

### 3.2 查看状态

```bash
/etc/init.d/homeproxy status
# 或
ps | grep sing-box
```

### 3.3 查看日志

```bash
# HomeProxy 主日志
logread -e homeproxy

# sing-box 客户端日志
logread -e sing-box-c

# 实时日志
tail -f /var/run/homeproxy/homeproxy.log
tail -f /var/run/homeproxy/sing-box-c.log
```

---

## 四、常用操作示例

### 4.1 添加节点 (UCI)

```bash
# 添加 VMess 节点
uci add homeproxy node
uci set homeproxy.@node[-1].type=vmess
uci set homeproxy.@node[-1].label="My Node"
uci set homeproxy.@node[-1].address=example.com
uci set homeproxy.@node[-1].port=443
uci set homeproxy.@node[-1].uuid=xxx-xxx-xxx
uci set homeproxy.@node[-1].tls=1

# 设置为主节点
uci set homeproxy.config.main_node=@node[-1]

# 提交
uci commit homeproxy
/etc/init.d/homeproxy reload
```

### 4.2 修改路由模式

```bash
uci set homeproxy.config.routing_mode=proxy_all
uci commit homeproxy
/etc/init.d/homeproxy reload
```

### 4.3 测试连接

```bash
ubus call luci.homeproxy connection_check '{"site":"google"}'
ubus call luci.homeproxy connection_check '{"site":"baidu"}'
```

---

## 五、注意事项

1. **权限**: 大部分操作需要 root 权限
2. **生效**: UCI 修改后需执行 `/etc/init.d/homeproxy reload` 生效
3. **备份**: 重要操作前备份 `/etc/config/homeproxy`
4. **安全**: API 访问应限制在可信网络
