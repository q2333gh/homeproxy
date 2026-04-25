选择 `bypass_mainland_china` 后，主流程可以按 **“配置写入 -> 服务重载 -> 运行时规则生效”** 来看：

- **1) 前端选项值**
  - LuCI 下拉框里 `Bypass mainland China` 对应值就是 `routing_mode=bypass_mainland_china`。
  
```251:257:/home/jwk/code/homeproxy/htdocs/luci-static/resources/view/homeproxy/client.js
o = s.taboption('routing', form.ListValue, 'routing_mode', _('Routing mode'));
o.value('gfwlist', _('GFWList'));
o.value('bypass_mainland_china', _('Bypass mainland China'));
o.value('proxy_mainland_china', _('Only proxy mainland China'));
o.value('custom', _('Custom routing'));
o.value('global', _('Global'));
o.default = 'bypass_mainland_china';
```

- **2) 保存/应用后写入 UCI**
  - 最终落到 `homeproxy.config.routing_mode`，默认配置里也是这个值。  

```25:31:/home/jwk/code/homeproxy/root/etc/config/homeproxy
config homeproxy 'config'
	option main_node 'nil'
	option main_udp_node 'same'
	option dns_server '8.8.8.8'
	option china_dns_server '223.5.5.5'
	option routing_mode 'bypass_mainland_china'
	option routing_port 'common'
```

- **3) 触发 init 重载（stop + start）**
  - `homeproxy` 的 init 脚本对配置变更注册了 reload trigger，reload 实际执行 `stop` 然后 `start`。  

```343:352:/home/jwk/code/homeproxy/root/etc/init.d/homeproxy
reload_service() {
	log "Reloading service..."

	stop
	start
}

service_triggers() {
	procd_add_reload_trigger "$CONF"
```

- **4) start 阶段根据 routing_mode 走“绕过大陆”分支**
  - 读取 `routing_mode`（默认就是 `bypass_mainland_china`）。
  - 生成并校验 `sing-box-c.json`（`generate_client.uc`）。
  - 生成 dnsmasq 规则、防火墙规则并 `fw4 reload`。
  - 为该模式准备 `cache.db`。  

```35:37:/home/jwk/code/homeproxy/root/etc/init.d/homeproxy
local routing_mode proxy_mode
config_get routing_mode "config" "routing_mode" "bypass_mainland_china"
config_get proxy_mode "config" "proxy_mode" "redirect_tproxy"
```

- **5) sing-box 配置层面的核心变化（generate_client.uc）**
  - 在该模式下会启用 `china_dns_server`，并加上 `geosite-cn / geoip-cn` 相关 DNS/路由规则。
  - 默认域名解析器会偏向 `china-dns`。
  - 下载并使用 CN/非CN 规则集（remote rule_set）。
  - 开启实验缓存 `cache.db`（该模式和 custom 都开）。  

```470:476:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/generate_client.uc
if (routing_mode === 'bypass_mainland_china') {
	push(config.dns.servers, {
		tag: 'china-dns',
		domain_resolver: {
			server: 'default-dns',
			strategy: 'prefer_ipv6'
```

```862:868:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/generate_client.uc
if (routing_mode === 'bypass_mainland_china') {
	push(config.route.rule_set, {
		type: 'remote',
		tag: 'geoip-cn',
		format: 'binary',
		url: 'https://fastly.jsdelivr.net/gh/1715173329/IPCIDR-CHINA@rule-set/cn.srs',
```

- **6) 防火墙层面的核心变化（firewall_post.ut）**
  - 会创建 `homeproxy_mainland_addr_v4/v6` 集合（来自 `china_ip4.txt/china_ip6.txt`）。
  - 在 NAT/TPROXY/TUN 的多条链里都加了：**目标是大陆 IP -> return（不走代理）**。
  - 所以“绕过大陆”在防火墙层面也被强制落实，不只靠 sing-box 内部规则。  

```178:185:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/firewall_post.ut
{% elif (match(routing_mode, /mainland_china/) || bypass_cn_traffic === '1'): %}
set homeproxy_mainland_addr_v4 {
	type ipv4_addr
	flags interval
	auto-merge
	elements = {
```

```347:350:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/firewall_post.ut
{% elif (routing_mode === 'bypass_mainland_china' || bypass_cn_traffic === '1'): %}
	ip daddr @homeproxy_mainland_addr_v4 counter return
{% if (ipv6_support === '1'): %}
	ip6 daddr @homeproxy_mainland_addr_v6 counter return
```

---

一句话总结：`bypass_mainland_china` 是一个 **双层策略**：  
**sing-box 路由/DNS 层**做国内外分流 + **fw4/nft 防火墙层**对大陆目标地址直接放行（不进代理），两层共同保证“大陆直连、非大陆走代理”。



# bypass具体规则:
`bypass_mainland_china` 的核心规则可以概括为：

- **大陆目标直连（不代理）**
- **非大陆目标走主代理节点**
- **DNS 也做国内外分流**

具体在代码里是这几层：

```347:351:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/firewall_post.ut
{% elif (routing_mode === 'bypass_mainland_china' || bypass_cn_traffic === '1'): %}
	ip daddr @homeproxy_mainland_addr_v4 counter return
{% if (ipv6_support === '1'): %}
	ip6 daddr @homeproxy_mainland_addr_v6 counter return
```

这表示：命中大陆 IP 集合就 `return`，即不再进入代理链路。

```178:196:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/firewall_post.ut
{% elif (match(routing_mode, /mainland_china/) || bypass_cn_traffic === '1'): %}
set homeproxy_mainland_addr_v4 {
	...
	elements = {
		{% for (let cnip4 in split(trim(readfile(resources_dir + '/china_ip4.txt')), /[\r\n]/)): %}
		{{ cnip4 }},
...
set homeproxy_mainland_addr_v6 {
	...
		{% for (let cnip6 in split(trim(readfile(resources_dir + '/china_ip6.txt')), /[\r\n]/)): %}
```

大陆 IP 集合来源是 `china_ip4.txt` / `china_ip6.txt` 资源文件。

---

在 `sing-box` 生成配置里，`bypass_mainland_china` 还会启用这些规则：

```488:493:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/generate_client.uc
push(config.dns.rules, {
	rule_set: 'geosite-cn',
	action: 'route',
	server: 'china-dns',
	strategy: 'prefer_ipv6'
});
```

- `geosite-cn` 域名查询走 `china-dns`（国内 DNS）。
- 还有 “非 geosite-noncn 且 geoip-cn” 的逻辑也走 `china-dns`。

```862:875:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/generate_client.uc
if (routing_mode === 'bypass_mainland_china') {
	push(config.route.rule_set, { tag: 'geoip-cn', ... });
	push(config.route.rule_set, { tag: 'geosite-cn', ... });
	push(config.route.rule_set, { tag: 'geosite-noncn', ... });
}
```

- 会加载 `geoip-cn / geosite-cn / geosite-noncn` 远程规则集用于分流判断。

```835:835:/home/jwk/code/homeproxy/root/etc/homeproxy/scripts/generate_client.uc
config.route.final = 'main-out';
```

- 默认最终出口是 `main-out`（主代理），所以**非大陆流量最终会被代理**；大陆流量在前面的规则/防火墙层已被放行直连。

---

一句话版：`bypass_mainland_china` = **“CN 直连，非 CN 代理，DNS 同步分流（china-dns + 规则集）”**。