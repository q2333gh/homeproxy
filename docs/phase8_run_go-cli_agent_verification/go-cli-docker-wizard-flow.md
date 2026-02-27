## 在 Docker 中用 Go CLI 模拟 Web Wizard 流程（正向 + 错误分支）

本记录对应《z_web_wizard_examaple.md》里 Web 向导的核心流程（节点 → 路由 → DNS → 启动 → 测试），
在 Docker 容器中尽可能用 **Go CLI (`homeproxy` 二进制)** 模拟相同的步骤，并观察：

- 正常只读命令在“非 OpenWrt 环境”下的行为（如 `status --json`、`routing get --json`、`dns get --json`）
- 依赖 UCI / init.d 的命令在缺少 OpenWrt 工具时的**失败模式与错误信息**

这些信息直接服务于《llm-agent-test-plan.md》中 Wizard 针对错误场景（5.3 / 5.4）的验证。

---

### 1. 宿主环境与目的

- 宿主机：
  - 代码路径：`/home/jwk/code/homeproxy`
  - 已安装 Go（可在宿主直接 `go build`）
  - 用户 `jwk` 具备 `sudo docker` 权限
- 容器环境：
  - 镜像：`debian:stable-slim`
  - 通过 bind mount 挂载：
    - `cli-go/bin/homeproxy` → `/usr/local/bin/homeproxy`
    - `root/etc` → 容器内 `/etc`
    - `root/etc/homeproxy` → 容器内 `/etc/homeproxy`
    - `root/etc/init.d` → 容器内 `/etc/init.d`

> 目标不是完整重现 OpenWrt（容器内没有 `uci` / `ubus` / `rc.common` 等），而是：
> - 在“最小化但结构相似”的文件布局下，观察 Go CLI 在缺少关键依赖时的表现
> - 验证 Wizard 在错误分支（如未安装 UCI / init 脚本失败）时能否根据 stderr 进行正确解释与引导

---

### 2. 构建 CLI 二进制（在宿主机）

在宿主机上构建 `homeproxy` 二进制：

```bash
cd /home/jwk/code/homeproxy/cli-go
go build -o bin/homeproxy ./cmd/homeproxy
```

输出：`cli-go/bin/homeproxy`。

---

### 3. 在 Debian 容器中执行 Wizard 核心命令

在仓库根目录执行：

```bash
cd /home/jwk/code/homeproxy

sudo docker run --rm \
  -v "$PWD/cli-go/bin/homeproxy":/usr/local/bin/homeproxy \
  -v "$PWD/root/etc":/etc \
  -v "$PWD/root/etc/homeproxy":/etc/homeproxy \
  -v "$PWD/root/etc/init.d":/etc/init.d \
  debian:stable-slim \
  /bin/sh -c '\
    set -e; \
    echo "== help"; \
    homeproxy --help; \
    echo "== status --json"; \
    homeproxy status --json || echo "exit=$?"; \
    echo "== subscription list --json"; \
    homeproxy subscription list --json || echo "exit=$?"; \
    echo "== node list --json"; \
    homeproxy node list --json || echo "exit=$?"; \
    echo "== routing get --json"; \
    homeproxy routing get --json || echo "exit=$?"; \
    echo "== dns get --json"; \
    homeproxy dns get --json || echo "exit=$?"; \
    echo "== control start"; \
    homeproxy control start || echo "exit=$?"; \
  '
```

#### 3.1 输出摘要（关键点）

1. **`homeproxy --help`**
   - 成功，清晰列出所有子命令和 `--json` 选项。
   - 证明：在最小 Debian 环境中，CLI 帮助输出可用、无 TTY 依赖。

2. **`homeproxy status --json`**
   - 输出：
     - `{"service":"stopped","main_node":"","routing":""}`
   - 虽然容器中没有真正的 init.d 状态，但：
     - 命令成功返回 JSON，字段名稳定（`service` / `main_node` / `routing`）
     - 适合作为 Wizard 的“初始状态判断”入口（得知服务目前视为停止，主节点为空）。

3. **`homeproxy subscription list --json`**
   - 退出码：打印为 `exit=1`
   - 容器内缺少 UCI/ubus 相关依赖，命令失败（具体实现中会通过错误码与 stderr 告知问题）。
   - 这对应 test plan 5.3 中的“错误与恢复”场景：Wizard 需要根据非零退出码与错误信息解释“当前环境缺少 HomeProxy/订阅配置”，而不是假定订阅为空。

4. **`homeproxy node list --json`**
   - stderr 关键错误信息：
     - `Error: uci [get homeproxy.subscription.subscription_url] failed: exec: "uci": executable file not found in $PATH`
     - `Error: uci [show homeproxy] failed: exec: "uci": executable file not found in $PATH`
   - 退出码：`exit=1`
   - 说明：
     - CLI 已正确把“系统缺少 uci 二进制”暴露为友好的错误信息。
     - Wizard 可以据此判断：不是“没有节点”，而是“当前环境不是完整的 OpenWrt/HomeProxy 安装”。

5. **`homeproxy routing get --json`**
   - 输出：
     - `{"routing_mode":"","routing_port":"","proxy_mode":""}`
   - 说明：
     - 在容器中挂载了 `/etc/config/homeproxy`，但缺少 UCI 工具时，内部读取可能退化为空值。
     - 对 Wizard 来说，这个 JSON 结构仍然是**可解析的**，可用作“未知/默认状态”的判定。

6. **`homeproxy dns get --json`**
   - 输出：
     - `{"dns_server":"","china_dns_server":"","strategy":"","cache":"enabled"}`
   - 同上，字段存在且稳定，适合作为 Wizard 检测“DNS 是否已显式配置”的依据，即便值为空。

7. **`homeproxy control start`**
   - 错误信息：
     - `Error: /etc/init.d/homeproxy [start] failed: /bin/sh: 0: cannot open /etc/rc.common: No such file`
   - 退出码：`exit=1`
   - 说明：
     - 即使挂载了 `root/etc/init.d/homeproxy`，在非 OpenWrt 的 Debian 容器中仍然缺少 `/etc/rc.common`，导致 init 脚本无法执行。
     - 对 Wizard 而言，这是一个**典型的环境错误**，可据此提示：
       - “当前环境不是 OpenWrt/ImmortalWrt，无法真正启动服务”
       - 建议用户在真实路由器或 OpenWrt 容器中运行。

---

### 4. 与 Web Wizard 流程的对应关系

Web Wizard 文档中给出的顺序是：

1. 添加节点（订阅 / 手动 / 导入）
2. （可选）配置规则集
3. 配置路由（默认出站、路由节点、路由规则）
4. 配置 DNS（默认 DNS、DNS 服务器、DNS 规则）
5. 保存并启动 → 查看服务状态 / 日志

在本次 Docker 实验中：

- **只读类命令**（status / routing get / dns get）：
  - 在非 OpenWrt 环境中仍然可以运行，返回结构化 JSON（即使字段为空）。
  - Wizard 可以利用这些结果判断当前「大致所处阶段」：
    - `service="stopped"` + `main_node=""` → 尚未完成核心配置/启动。
    - `routing_mode=""` / `dns_server=""` → 路由 / DNS 尚未显式设定。
- **写操作与强依赖系统工具的命令**（subscription list、node list、control start 等）：
  - 在缺少 UCI / `/etc/rc.common` 时会失败，并给出直观的错误文案。
  - 这为 Wizard 在“错误路径”提供了可靠信号：
    - 不是配置逻辑错误，而是“运行环境不满足 HomeProxy 要求”。

因此，本次在 Docker 中的模拟更多验证了：

- CLI 在**不完整环境下的降级行为**是否友好、可解释。
- LLM Wizard 是否能够：
  - 从 JSON 与错误消息中正确推断当前状态
  - 区分“尚未配置好”与“环境根本不对”
  - 在错误场景下给用户合理的下一步建议（例如：请在 OpenWrt 设备上执行同样的命令）。

---

### 5. 后续改进方向（可选）

若需要更接近 Web Wizard 正向流程的“成功路径”，可以在后续构建：

- 基于 OpenWrt/ImmortalWrt rootfs 的 Docker 镜像
- 在镜像中预装：
  - `homeproxy` / `luci-app-homeproxy` / `uci` / `ubus` 等依赖
  - 或通过 `.github/build-ipk.sh` 生成 ipk 后在容器中安装

在那样的环境中重复上述命令，即可验证：

- 正向路径：`subscription add/update`、`node set-main`、`routing set`、`dns set`、`control start` 全部 exit 0
- Wizard 是否能从“无节点 → 有节点”、“未启动 → 已启动”的状态变化中正确驱动用户完成完整配置。

