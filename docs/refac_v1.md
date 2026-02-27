### 总体判断（从第一性原理看）

- **职责边界是对的**：当前 CLI 把逻辑拆成 `homeproxy` 入口 + `lib/homeproxy.sh` 通用库 + `node.sh / routing.sh / dns.sh / subscription.sh` 四个领域模块，基本是「命令行薄封装 → UCI / init.d / ubus」的结构，这个方向本身不算过度设计。
- **复杂度主要来自“不收尾”而不是“抽象太多”**：有重复逻辑、半实现功能、接口不一致的问题，会让人读起来更乱，维护成本变高，但架构本身还算轻量。

---

### 现在这套实现里，哪些地方“搞复杂了”

- **重复 & 分裂的基础能力**  
  - `homeproxy.sh` 里有 `check_installed`，入口脚本 `homeproxy` 又自己实现了一版 `check_installed`，而且一个用 `$CONFIG_FILE`，一个写死 `/etc/config/homeproxy`，容易漂移。  
  - 服务控制也是：一部分通过 `reload_homeproxy`，一部分在 `service_control` 里直接调用 `/etc/init.d/homeproxy`。

- **声明了 JSON / 结构化输出，但没有贯穿到底**  
  - 帮助里有 `-j, --json`，`node_list` 支持 `format=json`，但入口并没有统一解析 `-j` 然后给各个子命令一个“输出模式”，导致 JSON 只是个“半隐藏功能”，全局行为不一致，增加心智负担。
  
- **功能表面很全，实际有不少 stub / 半成品**  
  - `routing_rule_add`、`subscription_filter remove` 明确写着 “not fully implemented”，但命令还是暴露在 `help` 和自动补全里。  
  - 用户/维护者看接口会以为这些能力是完整的，读代码才发现只是 log 一句，这种“假完备”会显著拉高理解成本。

- **命名/行为有迷惑性的小坑**  
  - `node_add` 里生成了 `node_name="node_$(date +%s)"`，但实际 UCI section 名还是 `cfgxxxx`，`find_node_by_name` 又依赖真实 section 名或 `label`。  
  - 日志提示 “Use 'homeproxy node set-main $node_name' to activate” 实际很可能失败，这既是 bug，也让人更难信任 CLI 的抽象。

- **安装/运行路径逻辑有点绕**  
  - `INSTALL_DIR` 优先用环境变量 `HOMEPOXY_LIB`（看起来还是 typo），找不到再 fallback 到 `SCRIPT_DIR/lib`。  
  - 同时 `install.sh` 又把库固定装到 `/usr/libexec/homeproxy/lib.sh` + `/usr/libexec/homeproxy/lib/*.sh`，理论上入口完全可以只支持这一个路径，少一层分支就少一处认知成本。

---

### 如果按“第一性原理”重新收敛一下，这套 CLI 可以怎样更简单

围绕三个核心事实：

1. **真实权威状态都在 UCI / init.d / ubus**（`/etc/config/homeproxy`、`/etc/init.d/homeproxy`、`luci.homeproxy`），  
2. **CLI 只是人类友好的 façade**（语义更好记、输出更好看），  
3. **可维护性 > 功能面子工程**（“少但稳”比“多但半残”更重要），

可以这样收紧架构，而不大改目录结构：

- **1）把“基础设施”集中到一个地方，入口脚本完全复用**  
  - 保留当前的 `lib/homeproxy.sh`，让它成为唯一的：
    - 安装检测：`check_installed`（用 `CONFIG_FILE`，由 `cli.conf` 控制）
    - 服务控制：`reload_homeproxy` / `service_control` / `check_running`
    - 常量路径：`CONFIG_FILE` / `INIT_SCRIPT` / `LOG_DIR`
  - 入口 `homeproxy` 只负责：
    - 解析全局选项（`-h`, `-j`, 未来可能有 `--debug`）  
    - `load_module "<domain>"` 和路由到 `node_list / routing_set ...`  
    - 所有检查 & 路径都进公共库，不再在入口里重写。

- **2）统一输出模型：要么只做人看得懂，要么认真支持 JSON**  
  - 最简单的版本：**直接去掉 `-j/--json` 和 `output_json/print_table`**，只保留人类友好的文本输出，减少一条维度的复杂度。  
  - 如果你确实需要 CLI 被其他程序脚本消费，就反过来：  
    - 入口解析 `-j/--json` → 设置全局 `OUTPUT=json`  
    - 各模块的 `*_get` / `node_list` 收一个 `format`，统一遵守 `OUTPUT`。  
  - 目前这种“部分支持 JSON、部分不支持”的状态，是最难维护也最难理解的。

- **3）对“未完成”的能力，宁可暂时不暴露**  
  - 把 `routing_rules_list`、`routing_rule_add`、`subscription_filter remove` 这种明显未实现完备逻辑的功能：
    - 要么从 `help` 和 completion 中隐藏（只保留内部实验用），  
    - 要么干脆先删掉，等真有清晰需求再设计。  
  - 这一点对“易于阅读”的帮助很大——别人看一圈命令，就知道哪些是真正走通的主线能力。

- **4）收紧 node 相关的命名逻辑，消除“假 name”**  
  - 最简单的做法：  
    - `node_add` 不再制造虚构的 `node_name`，只提示 “Use label or index with node set-main”。  
    - 或者显式把 section 名存一个可预测的 key，比如 `name=node_12345`，所有地方只按这个 `name` 查。  
  - 目标是：**用户命令行里能看到的名字，一定能用在其他命令里**，不需要去理解 UCI 的内部 section 名。

- **5）从“命令矩阵”回推一次用例，删掉多余的分支**  
  - 按你在 `docs/cli-enhancement-plan.md` 里的 Phase 1–3，其实当前代码已经覆盖了 Phase 1 + 大部分 Phase 2。  
  - 下一步更重要的不是再加 Phase 3 功能，而是：
    - 对照 API 文档 & UCI 结构，列清楚“高频操作 5–8 条”（加/删节点、改主节点、切路由模式、看状态/日志、订阅增删更）  
    - 确保这些路径极其顺滑（短命令、错误信息明确、逻辑集中），  
    - 其他低频/未实现好的功能先不暴露。  

---

### 一句话总结

**这套 CLI 架构本身不算“过度复杂”，问题主要是一些重复/半成品/不一致的地方拉高了理解成本；通过收紧公共库、统一输出模型、隐藏未完成功能、清理命名和路径逻辑，就能得到一个更“瘦”、更容易读和改的版本，而不需要推倒重来。**  

如果你愿意，我可以按上面这套思路，直接帮你改一版“极简但完整”的 CLI（先做：统一 `check_installed`、去掉 JSON 选项、清理 stub 命令和 `node_add` 的 name 逻辑）。



### 结论先说

**在你的约束下，我强烈推荐用 Go 实现新的 CLI**，把现在的 `.sh` 当作过渡层/包装，最后完全替掉。

---

### 为什么是 Go（结合你的场景）

- **适配 OpenWrt / 路由器环境友好**  
  - 单个静态二进制，方便打包成 OpenWrt 包（`homeproxy-cli`），不引入解释器依赖。  
  - 交叉编译成熟：`linux/mips`, `linux/arm`, `linux/x86_64` 都好搞。

- **实现成本和可读性平衡好**  
  - 语法直观，团队里即使有人不熟，也能很快读懂，比 C/Rust 门槛低。  
  - 有成熟 CLI 框架（`spf13/cobra` / `urfave/cli`），可以直接把你现在的命令层级映射过去：`homeproxy node list`、`homeproxy routing set` 等。

- **与现有系统集成简单**  
  - 第一阶段完全可以直接 `os/exec` 调 `uci` / `/etc/init.d/homeproxy` / `ubus`，逻辑迁移最轻；  
  - 真要硬核一点，后面再考虑通过 cgo 绑 `libuci` / `libubus`。

- **生态一致性**  
  - `sing-box` 本身就是 Go，风格更统一；未来要做一些“节点测速/benchmark/并发任务”类的功能，用 Go 更顺手。

---

### 其他备选语言简评

- **Rust**：安全、范式好，但  
  - 编译时间长、工具链在 OpenWrt 侧/交叉编译配置比较重；  
  - 对“偶尔维护的人”阅读门槛高一些，不一定符合你“易于维护阅读”的优先级。

- **Python / Node / 其他脚本语言**：  
  - 在路由器上额外拉解释器和 runtime，很容易变成“为一个 CLI 引入一坨依赖”；  
  - 对 OpenWrt 用户来说不够“原生”，可运维性也差一点。

- **C / ucode**：  
  - 更贴近 OpenWrt 官方生态，但开发/维护成本明显高于 Go，而且你想要的是“易读+易改”，C 不太符合。

---

### 下一步建议（如果你同意 Go）

- **先确定一个最小子集**：按 `refac_v1` / `cli-enhancement-plan`，先只实现：  
  - `status`、`node list/set-main/add/remove`、`routing get/set`、`dns get/set`、`subscription list/add/remove/update`。  
- **Go 里设计一个干净的 domain 层**：  
  - 封装成 `uci` / `service` / `rpc` 的小包，命令只是调用这些包。  
- **现有 `.sh` 变成过渡包装**（可选）：  
  - 短期内可以 `homeproxy`（sh）直接调用新 `homeproxy-go`，保持老用户习惯不变；  
  - 稳定后干掉 shell 版，只保留 Go 版。

如果你愿意，我可以帮你列出一个 Go 版 CLI 的目录结构 + 主命令 skeleton（不动现有代码，只先给一套干净的骨架）。