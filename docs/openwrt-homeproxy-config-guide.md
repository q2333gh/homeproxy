# OpenWrt 使用 Sing-Box 插件 Homeproxy 科学上网配置教程

来源: RULTR + 闲作坊

HomeProxy 是 OpenWrt 平台的 sing-box 代理工具，以优异的性能、丰富的协议支持及细致的分流策略配置著称。

---

## 一、环境要求

系统版本: OpenWrt 23.05+ 或 ImmortalWrt 23.05+
防火墙: 仅支持 firewall4
芯片架构: ARM64 / AMD64

---

## 二、安装

1. Web 登录 OpenWrt 后台
2. 进入系统 -> 软件包
3. 搜索 homeproxy 安装核心组件
4. 建议同步安装 luci-app-homeproxy 获取图形化界面
5. 安装成功后，服务菜单会增加 HomeProxy 菜单项；若未显示，重启路由器

---

## 三、节点配置

### 3.1 订阅方式

1. 进入服务 -> Homeproxy -> 节点设置 -> 订阅
2. 在订阅地址中输入机场订阅链接
3. 配置自动更新、使用代理更新、允许不安全连接等选项
4. 点击保存并应用

### 3.2 手动添加

1. 进入节点标签页
2. 输入节点名称，点击添加
3. 选择协议类型，填写配置信息，保存

### 3.3 组节点

Selector: 手动选择节点
URLTest: 自动测速选择最佳节点

注意: 如果使用直连出站项，必须添加一个类型为直连的节点，否则 HomeProxy 会报错停止。

---

## 四、客户端配置（核心）

进入客户端设置，包含九项：路由设置、路由节点、路由规则、规则集、DNS 设置、DNS 服务器、DNS 规则、访问控制、控制面板。

### 4.1 规则集（内置+自定义）

HomeProxy 已内置以下规则集，如无特殊需求可直接使用：

- hp-geoip-cn: 中国 IP 段
- hp-geoip-private: 私网 IP
- hp-geosite-cn: 中国网站
- hp-geosite-microsoft-cn: 微软系中国服务
- hp-geosite-netflix: Netflix
- hp-geoip-netflix: Netflix IP

常用远程规则集 URL：

```
# 中国 IP
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geoip/cn.srs

# 中国网站
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/cn.srs

# YouTube
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/youtube.srs

# ChatGPT
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/openai.srs

# Netflix 网站
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/netflix.srs

# Netflix IP
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geoip/netflix.srs

# Telegram IP
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geoip/telegram.srs

# Telegram 域名
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/telegram.srs

# BiliBili
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/bilibili.srs

# Twitter
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo-lite/geosite/twitter.srs
```

提示: 远程规则集类型选"远程"，格式选"二进制"（srs），出站不要选"直连"

自定义本地规则集：

在 /etc/homeproxy/ruleset/ 创建 customsite.json:

```json
{
  "version": 1,
  "rules": [
    {
      "domain_suffix": [
        "example.com",
        "example1.com"
      ]
    }
  ]
}
```

然后在规则集管理界面添加：类型选"本地"，格式选"源文件"（json），路径填写上述文件路径。

---

### 4.2 路由设置

- 路由模式: 必选"自定义路由模式"
- 路由端口: 可选"所有端口"或"仅常用端口"
- 代理模式: 默认 TCP/UDP 全部转发（5330/5331/5333）
- IPv6 支持: 建议取消勾选
- 绕过中国流量: 可选，减轻 HomeProxy 性能消耗
- 覆盖目标地址: 建议不启用
- 默认出站: 未匹配规则时的保底出站路径；若选"禁用"则停止工作

---

### 4.3 路由节点

将代理节点与路由建立关联：

1. 输入路由节点名称，点击"添加"
2. 选择对应的代理节点，其他保持默认
3. 保存

注意: 系统默认含有"直连"和"封锁"两个路由节点，配置不对会导致 HomeProxy 无法启动

---

### 4.4 路由规则

示例规则逻辑：

1. 封锁 quic 流量 -> 出站选"封锁"
2. 中国大陆 IP/网站 + 私网 IP -> 出站选"直连"
3. 其他所有流量 -> 出站选"代理"（使用 URLTest 节点测速选优）

提示: 规则有顺序匹配优先级，在上方的先匹配

---

### 4.5 DNS 设置

#### DNS 服务器

添加 Google DoT (TCP DNS)：
- 类型: DNS Over TLS (DoT) 或 DNS Over HTTPS (DoH)
- 地址: 8.8.8.8 或 tls://dns.google / https://dns.icloud.com/dns-query
- 如使用域名作为 DNS 服务器，需配置"地址解析器"

提示: 如果代理节点不支持 UDP，需使用 TCP 方式连接 DNS 服务器

#### DNS 规则

根据需求配置域名解析的路由规则，配合路由规则实现精确分流。

#### 建议设置

- 默认 DNS: 使用国外 DNS
- 禁用 DNS 缓存: 必选！路由器启动时规则未下载完成会导致大量 DNS 解析失败，可能卡死路由器
- EDNS Client Subnet: 无需设置
- 存储被拒绝的 DNS 响应缓存: 不需要

---

## 五、使用

1. 启动 HomeProxy
2. 进入"服务状态"查看运行日志
3. 测试连接：点击内外网网站测试按钮

代理端口：

- 5330: Mixed 端口（HTTP + SOCKS），推荐
- 5331: HTTP 代理
- 5333: SOCKS 代理

使用方法: 将浏览器网络代理设置为路由器 IP + 端口 5330

---

## 六、总结

配置流程：

1. 添加节点（订阅或手动）
2. 配置路由节点
3. 添加规则集（可选自定义）
4. 配置路由规则
5. 配置 DNS 服务器和 DNS 规则
6. 保存并测试

HomeProxy 已内置常用规则集，日常使用只需添加节点即可，更多细节可参考 MetaCubeX 和 SagerNet 官方规则集。
