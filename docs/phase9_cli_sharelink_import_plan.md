# CLI `Import share links` 实施计划

日期: 2026-03-06
目标: 让 `homeproxy node import` 支持与 LuCI「Import share links」一致的导入行为，并保留现有订阅 URL 导入能力。

## 1. 范围

- 全量支持以下分享链接协议（与当前 UI `parseShareLink()` 对齐）:
  - `anytls://`
  - `http://`, `https://`（代理分享链接语义）
  - `hysteria://`
  - `hysteria2://`, `hy2://`
  - `socks://`, `socks4://`, `socks4a://`, `socsk5://`, `socks5h://`
  - `ss://`
  - `trojan://`
  - `tuic://`
  - `vless://`
  - `vmess://`
- 保留原有行为:
  - `homeproxy node import <http/https 订阅 URL>` 继续添加到 `homeproxy.subscription.subscription_url`

## 2. 行为对齐点（与 UI）

- 输入支持多行；自动去重空行与重复行。
- 分享链接解析失败时跳过并统计失败数，不中断整批导入。
- 导入后按 UI 语义补充默认值:
  - 若节点 `tls=1` 且 `subscription.allow_insecure=1`，强制 `tls_insecure=1`
  - 对 `vless/vmess` 节点写入 `subscription.packet_encoding`
- 若无 label，回退 `address:port`；IPv6 地址去 `[]`。

## 3. 实现步骤

1. 新增 `sharelink` 解析模块（Go）:
   - 协议分支与字段映射按 UI `parseShareLink()` 对齐
   - 支持 URL-safe/Base64 解码（`ss`/`vmess`）
2. 扩展 `node import`:
   - 自动识别订阅 URL 与分享链接
   - 支持多行批量导入
   - 统一提交 `uci commit + service reload`
3. 增加单元测试:
   - `hy2` 示例链路（本次用户提供）
   - `vmess` 基础链接解析
   - 订阅 URL 识别逻辑
4. 文档更新:
   - CLI 用法描述改为支持 `<share-link|url>`

## 4. 验收标准

- 用户给定 `hy2://...` 可被 `homeproxy node import` 成功导入为 `hysteria2` 节点。
- 旧命令 `homeproxy node import https://...` 仍可添加订阅 URL。
- `homeproxy node list --json` 与 `uci show homeproxy` 可见正确字段落盘。
