## 在 OpenWrt 基础镜像中，用 Go CLI 重走 Web Wizard 流程（含真实 UCI）

本记录在真正的 **OpenWrt rootfs Docker 镜像** 中，用 Go CLI (`homeproxy` 二进制) 尽可能贴近
《z_web_wizard_examaple.md》里的 Web Wizard 顺序（节点 → 路由 → DNS → 启动 → 状态）的行为，
并特别观察：

- 在有真实 UCI 配置、但仅挂载 HomeProxy 文件的情况下，Go CLI 对订阅、路由、DNS、启动的行为
- 给定一个 **实际 hy2 订阅 URL** 时，CLI 的输入校验和错误信息是否对 Wizard 友好

---

### 1. 环境与挂载布局

#### 1.1 宿主机前提

- 仓库路径：`/home/jwk/code/homeproxy`
- 已构建 Go CLI 二进制：

```bash
cd /home/jwk/code/homeproxy/cli-go
go build -o bin/homeproxy ./cmd/homeproxy
```

#### 1.2 Docker 镜像

- 使用官方 OpenWrt rootfs 镜像：

```bash
sudo docker run --rm openwrt/rootfs:x86-64 /bin/ash -c 'uname -a; uci show 2>/dev/null || true'
```

确认镜像正常，且自带 `uci` 工具。

#### 1.3 挂载布局

在运行 Go CLI 时，将本仓库中的 HomeProxy 配置与脚本覆盖/挂载到容器内：

- `cli-go/bin/homeproxy` → `/usr/local/bin/homeproxy`
- `root/etc/config/homeproxy` → `/etc/config/homeproxy`
- `root/etc/homeproxy` → `/etc/homeproxy`
- `root/etc/init.d/homeproxy` → `/etc/init.d/homeproxy`

这样，容器内：

- `uci show homeproxy` 读取的就是本仓库随包提供的默认 UCI 配置
- init 脚本、脚本与 LuCI RPC 配置也来自当前源码

---

### 2. 实际执行命令

在仓库根目录执行：

```bash
cd /home/jwk/code/homeproxy

sudo docker run --rm \
  -v "$PWD/cli-go/bin/homeproxy":/usr/local/bin/homeproxy \
  -v "$PWD/root/etc/config/homeproxy":/etc/config/homeproxy \
  -v "$PWD/root/etc/homeproxy":/etc/homeproxy \
  -v "$PWD/root/etc/init.d/homeproxy":/etc/init.d/homeproxy \
  openwrt/rootfs:x86-64 \
  /bin/ash -c '
    set -e
    export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    echo "== uname"
    uname -a

    echo "== uci show homeproxy (before)"
    uci show homeproxy 2>/dev/null || echo "uci show homeproxy failed"

    echo "== status --json (before)"
    homeproxy status --json || echo "exit=$?"

    SUB="hy2://${HOMEPROXY_HY2_PASSWORD}@${HOMEPROXY_HY2_SERVER}?insecure=1&sni=www.bing.com#node-a"
    echo "== subscription add (hy2 url)"
    homeproxy subscription add \"$SUB\" || echo "exit=$?"

    echo "== subscription list --json (after add)"
    homeproxy subscription list --json || echo "exit=$?"

    echo "== routing get --json"
    homeproxy routing get --json || echo "exit=$?"

    echo "== dns get --json"
    homeproxy dns get --json || echo "exit=$?"

    echo "== control start"
    homeproxy control start || echo "exit=$?"

    echo "== status --json (after start)"
    homeproxy status --json || echo "exit=$?"
  '
```

---

### 3. 关键观测结果

#### 3.1 初始 UCI 与状态

- `uci show homeproxy` 输出表明当前配置来自随包默认值：
  - `homeproxy.infra.*`：mixed/redirect/tproxy/dns 端口、tun 配置等
  - `homeproxy.config.*`：
    - `main_node='nil'`
    - `dns_server='8.8.8.8'`
    - `china_dns_server='223.5.5.5'`
    - `routing_mode='bypass_mainland_china'`
    - `routing_port='common'`
    - `proxy_mode='redirect_tproxy'`
  - `homeproxy.dns.*`：`dns_strategy='prefer_ipv4'`、`default_server='local-dns'`、`disable_cache='0'` 等
  - `homeproxy.subscription.*`：无 `subscription_url`，仅有 auto_update / filter 等默认值
  - `homeproxy.server.enabled='0'`

- `homeproxy status --json`（初始）：
  - 输出：`{"service":"stopped","main_node":"","routing":"bypass_mainland_china"}`
  - 说明：
    - 在 OpenWrt 环境下，CLI 能正确从 init 脚本与 UCI 中推断出“服务未运行，但默认路由模式为 bypass_mainland_china”。
    - JSON 结构稳定，适合作为 Wizard 的起点状态信号。

#### 3.2 使用给定 hy2 订阅 URL 的行为

- 订阅 URL（来自用户，通过环境变量注入密码和服务器 `ip:port`）：

```text
hy2://$HOMEPROXY_HY2_PASSWORD@$HOMEPROXY_HY2_SERVER?insecure=1&sni=www.bing.com#node-a
```

- 执行 `homeproxy subscription add "$SUB"`：
  - 错误信息：
    - `Error: invalid URL: hy2://...`
  - 退出码：`exit=1`

**原因（从源码验证过）：**

- 当前 CLI 的订阅添加逻辑只接受以 `http://` 或 `https://` 开头的 URL：

```45:103:cli-go/cmd/homeproxy/subscription.go
if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
    return fmt.Errorf("invalid URL: %s", url)
}
```

- 因此，符合 sing-box/hysteria2 分享格式的 `hy2://...` 链接在 Go CLI 中会被直接判为无效。

对于 Wizard 而言，这一点非常关键：

- 不能简单地假设“任何订阅字符串都能被 `homeproxy subscription add` 接受”；
- 需要在错误分支中根据这条错误文案向用户解释：
  - 当前 CLI 仅支持 HTTP/HTTPS 形式的订阅 URL（通常是机场提供的 Web 订阅地址）；
  - 若用户提供的是 `hy2://` 单节点/分享链接，需要先在上游转换为 HTTP 订阅链接或通过 Web 界面处理。

#### 3.3 订阅列表与 UCI 交互

- `homeproxy subscription list --json`（在 add 失败之后）：
  - 错误：
    - `Error: uci [get homeproxy.subscription.subscription_url] failed: uci: Entry not found`
  - 退出码：`exit=1`

说明：

- 在默认 UCI 中，本就不存在 `subscription_url` 选项；
- 由于 `subscription add` 以“invalid URL”失败，UCI 未被修改；
- CLI 在尝试读取一个不存在的 UCI 选项时，会明确抛出“Entry not found”的错误。

Wizard 的应对策略：

- 将此视为“尚未配置任何订阅 URL”，而非环境错误；
- 引导用户提供一个符合 CLI 要求的 HTTP/HTTPS 订阅地址，或解释如何改用 Web 配置订阅。

#### 3.4 路由与 DNS 状态

- `homeproxy routing get --json`：
  - 输出：`{"routing_mode":"bypass_mainland_china","routing_port":"common","proxy_mode":"redirect_tproxy"}`
  - 说明：
    - 即使节点/订阅未配置，默认路由模式和端口策略已从 UCI 正确解析出来。
    - Wizard 可以据此判断：路由层面已经有合理默认值，未必第一步就需要修改。

- `homeproxy dns get --json`：
  - 输出：`{"dns_server":"8.8.8.8","china_dns_server":"223.5.5.5","strategy":"prefer_ipv4","cache":"enabled"}`
  - 说明：
    - DNS 配置也已经从 UCI 提供了合理默认值（公网 DNS + 国内 DNS + 策略）。
    - 符合用户“其他所需配置比如路由 dns 等应该都有默认值自己找找”的预期。

Wizard 可以据此做决策：

- 若用户没有特别要求，可以直接沿用默认路由/DNS，而将精力集中在：
  - 订阅/节点配置
  - 服务启动与状态验证

#### 3.5 启动服务的行为

- `homeproxy control start`：
  - 错误信息：
    - `Error: /etc/init.d/homeproxy [start] failed: /etc/rc.common: /lib/functions/procd.sh: line 54: can't create /var/lock/procd_homeproxy.lock: nonexistent directory`
  - 退出码：`exit=1`

说明：

- 在当前 OpenWrt rootfs 容器中，虽然存在 `/etc/init.d/homeproxy` 和 `/etc/rc.common`，但运行环境仍不完全：
  - `/var/lock` 或相关 procd 依赖目录未准备好
  - 可能也缺少 `procd`、`firewall4`、`sing-box` 等完整运行依赖
- init 脚本因此在尝试创建锁文件时失败。

Wizard 应如何解释：

- 这是**环境级错误**，而不是配置逻辑问题；
- 可以向用户说明：
  - “当前 Docker 环境缺少完整的 OpenWrt/procd 运行环境，无法真正启动 HomeProxy 服务”；
  - 建议在真实路由器或完整 OpenWrt/ImmortalWrt 系统中执行相同步骤。

- `homeproxy status --json`（启动失败之后）仍然返回：
  - `{"service":"stopped","main_node":"","routing":"bypass_mainland_china"}`
  - 验证：CLI 在服务启动失败后不会伪造“running”状态。

#### 3.6 第二轮尝试：在容器内手动添加 hysteria2 节点并重试启动

为了更贴近 Web Wizard 中“先有节点 → 再有主节点 → 再启动”的流程，我们在同一 OpenWrt rootfs 镜像中追加了一轮尝试：

```bash
sudo docker run --rm \
  -v "$PWD/cli-go/bin/homeproxy":/usr/local/bin/homeproxy \
  -v "$PWD/root/etc/config/homeproxy":/etc/config/homeproxy \
  -v "$PWD/root/etc/homeproxy":/etc/homeproxy \
  -v "$PWD/root/etc/init.d/homeproxy":/etc/init.d/homeproxy \
  openwrt/rootfs:x86-64 \
  /bin/ash -c '
    set -e
    export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    mkdir -p /var/lock /var/run

    echo "== status --json (before second run)"
    homeproxy status --json || echo "exit=$?"

    echo "== add hysteria2 node from hy2 sample (manual)"
    homeproxy node add hysteria2 198.51.100.10 40020 node-a-node || echo "exit=$?"

    echo "== node list --json (after add)"
    homeproxy node list --json || echo "exit=$?"

    echo "== set-main to node-a-node"
    homeproxy node set-main node-a-node || echo "exit=$?"

    echo "== routing get --json (after set-main)"
    homeproxy routing get --json || echo "exit=$?"

    echo "== dns get --json (after set-main)"
    homeproxy dns get --json || echo "exit=$?"

    echo "== control start (second attempt, with /var/lock)"
    homeproxy control start || echo "exit=$?"

    echo "== status --json (after second start)"
    homeproxy status --json || echo "exit=$?"
  '
```

关键输出：

- `status --json (before second run)`：
  - 仍为 `{"service":"stopped","main_node":"","routing":"bypass_mainland_china"}`。

- `homeproxy node add hysteria2 198.51.100.10 40020 node-a-node`：
  - 失败，错误：
    - `Error: uci [commit homeproxy] failed: uci: I/O error`
  - `node list --json` 随后返回 `{"nodes":[]}`。
  - 说明：在该 rootfs 环境下，`uci commit homeproxy` 对挂载的 `/etc/config/homeproxy` 出现 I/O 错误（只读或缺少 overlay），导致新节点无法持久化。

- `homeproxy node set-main node-a-node`：
  - 失败：`Error: node not found: node-a-node`，与上一步 commit 失败一致。

- `routing get --json` / `dns get --json`：
  - 仍返回与 3.4 一致的默认值：
    - `{"routing_mode":"bypass_mainland_china","routing_port":"common","proxy_mode":"redirect_tproxy"}`
    - `{"dns_server":"8.8.8.8","china_dns_server":"223.5.5.5","strategy":"prefer_ipv4","cache":"enabled"}`
  - 说明：路由/DNS 默认 UCI 状态未因上述失败而改变。

- `homeproxy control start`（第二次，且已 `mkdir -p /var/lock /var/run`）：
  - 输出包含：
    - `[INFO] HomeProxy started`
  - 表明：
    - 先前因 `/var/lock` 缺失导致的 init 脚本错误已被修复；
    - 在当前 rootfs 环境下，init.d 脚本能顺利走到“启动”逻辑并认为启动成功。

- 但随后 `status --json (after second start)` 仍为：
  - `{"service":"stopped","main_node":"","routing":"bypass_mainland_china"}`
  - 说明：
    - `/etc/init.d/homeproxy status` 在该容器环境下依旧返回“未运行”或空输出；
    - CLI 的 `service` 字段严格依赖 init 脚本的状态输出，不会因为 start 打印了 “started” 日志就认定服务在运行。

对 Wizard 的启示：

- 在“只读或半只读”的 rootfs 容器中：
  - 所有通过 UCI 写入的操作（如 `node add`、`set-main`）可能因为 `uci: I/O error` 无法真正落盘；
  - Wizard 看到这类错误时，应判断为 **环境不可写**，而非配置逻辑错误。
- 即便 `control start` 打印“started”，也应以 `status --json` 的 `service` 字段为准来判断是否真正进入“运行中”状态。
- 因此，在容器中模拟 Web Wizard 时，**可以验证 CLI 行为和错误路径**，但不应把这种环境下的“启动成功”视为真实的生产运行状态；真正的成功路径仍需在具备可写 UCI 与完整 procd 环境的 OpenWrt/ImmortalWrt 设备上验证。

---

### 4. 对 Web Wizard 流程的启示

结合本次 OpenWrt 容器实验，可以总结：

- **默认路由与 DNS**：
  - 在无订阅/节点的情况下，UCI 已提供合理默认值；
  - Wizard 完全可以：
    - 先读 `routing get --json` / `dns get --json`，确认默认值；
    - 仅在用户显式要求时修改这些配置。

- **订阅环节**：
  - Go CLI 当前只接受 HTTP/HTTPS 订阅 URL，而 Web Wizard 示例中常见的 `hy2://` 单链接，需要额外转换；
  - Wizard 在收到 `invalid URL` 错误时，应立即解释当前限制，并提示用户使用机场 Web 订阅地址。

- **启动环节**：
  - 在不完整的容器环境中，`control start` 会因系统依赖缺失失败，并给出明确错误；
  - Wizard 应学会识别“环境缺失 vs 配置错误”，避免在环境错误场景下让用户去改无关配置。

整体来看，本次在 OpenWrt rootfs 中的实验，使得 Go CLI + Wizard 对“默认 UCI 配置”和“订阅/启动路径的实际行为”有了更接近真实路由器的验证，为后续在真实设备上的 Wizard 自动化提供了可靠的预演样本。 

---

### 5. 追加实验：复制可写 UCI 后的完整“节点 → 主节点 → 启动”路径

随后我们在同一镜像中改用“复制配置到容器内”的方式，使 `/etc/config/homeproxy` 成为容器本地可写文件，再次按 Web Wizard 顺序走了一遍简化流程：

```bash
sudo docker run --rm \
  -v "$PWD/cli-go/bin/homeproxy":/usr/local/bin/homeproxy \
  -v "$PWD/root/etc/config/homeproxy":/mnt/homeproxy-config \
  -v "$PWD/root/etc/homeproxy":/etc/homeproxy \
  -v "$PWD/root/etc/init.d/homeproxy":/etc/init.d/homeproxy \
  openwrt/rootfs:x86-64 \
  /bin/ash -c '
    set -e
    export PATH="/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"

    mkdir -p /var/lock /var/run /etc/config
    cp /mnt/homeproxy-config /etc/config/homeproxy

    echo "== status --json (before nodes)"
    homeproxy status --json || echo "exit=$?"

    echo "== add hysteria2 node from sample (manual)"
    homeproxy node add hysteria2 198.51.100.10 40020 node-a-node || echo "exit=$?"

    echo "== node list --json (after add)"
    homeproxy node list --json || echo "exit=$?"

    echo "== set-main to node-a-node"
    homeproxy node set-main node-a-node || echo "exit=$?"

    echo "== control start (with writable UCI)"
    homeproxy control start || echo "exit=$?"

    echo "== status --json (after start)"
    homeproxy status --json || echo "exit=$?"
  '
```

摘要结果：

- 初始 `status --json`：仍为 `{"service":"stopped","main_node":"","routing":"bypass_mainland_china"}`。
- `node add hysteria2 198.51.100.10 40020 node-a-node`：
  - 成功，日志提示已添加节点并提示使用 label/ID 进行 `set-main`。
  - `node list --json` 显示：
    - `{"nodes":[{"name":"node-a-node","address":"198.51.100.10:40020","type":"Hysteria2","status":"inactive"}]}`
- `node set-main node-a-node`：
  - 成功，将 `main_node` 更新为该节点。
- `control start`：
  - 输出 `[INFO] HomeProxy started`，说明 init 脚本在当前 rootfs + 可写 UCI + `/var/lock` 条件下可以顺利执行。
- 启动后 `status --json`：
  - `{"service":"stopped","main_node":"node-a-node","routing":"bypass_mainland_china"}`
  - 反映出：
    - UCI 中主节点状态已经更新（Wizard 可通过 JSON 看见 `main_node`）；
    - 但由于缺少真正的 sing-box/procd 集成，init 的 `status` 子命令仍无法证明“正在运行”，所以 `service` 依旧是 `"stopped"`。

从 Web Wizard 视角，这一轮实验证明：

- 在“OpenWrt rootfs + 我们自己的 UCI/脚本 + 可写配置”环境下，**Go CLI 的节点 / 主节点 / 启动路径本身是可以贯通且可观测的**（节点列表与 `main_node` 状态都能准确反映）。
- 但要让 `service` 字段真正变为 `"running"`，还需要在完整的 OpenWrt/ImmortalWrt 设备（已安装 sing-box、procd、firewall4 等依赖）上再跑一次相同流程，这已经超出了当前 Docker rootfs 的能力边界。