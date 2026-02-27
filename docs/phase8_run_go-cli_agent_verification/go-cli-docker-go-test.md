## 在 Docker 中运行 homeproxy Go CLI 自测（`go test ./...`）

本记录用于追踪针对《llm-agent-test-plan.md》中 **4.1 单元/契约测试** 的一次实际执行，方便后续复现与审计。

---

### 1. 目的

- 在**隔离的官方 Go 环境（Docker `golang:1.22`）**中运行 `cli-go` 的 `go test ./...`：
  - 验证 homeproxy Go CLI 在“干净”的官方 Go 1.22 环境下可以正常构建与通过自测。
  - 覆盖 test plan 中列出的 help/status/features/resources version/acl list/generator uuid、JSON `--json` 等单元与契约用例。

---

### 2. 环境前提

- 宿主机代码路径：`/home/jwk/code/homeproxy`
- 已安装并可 `sudo` 使用的 Docker（当前用户 `jwk` 具备 `sudo` 权限）。
- 需要从 Docker Hub 拉取镜像 `golang:1.22`（首次执行会花费一定时间）。

---

### 3. 实际执行命令

在宿主机上，从仓库根目录执行：

```bash
cd /home/jwk/code/homeproxy

sudo docker run --rm \
  -v "$PWD/cli-go":/workspace \
  -w /workspace \
  golang:1.22 \
  go test ./...
```

- 说明：
  - 将本地 `cli-go` 目录挂载到容器内 `/workspace`，避免在镜像内重复拉代码。
  - 在容器工作目录 `/workspace` 下执行 `go test ./...`，仅针对 Go CLI 部分自测。
  - 首次运行会自动从 Docker Hub 拉取 `golang:1.22`，日志中可见各层镜像的 Pull / Verifying / Pull complete 信息。

---

### 4. 与测试计划的对应关系

- 对应文档：`docs/phase8_run_go-cli_agent_verification/llm-agent-test-plan.md`
- 对应章节：**4.1 单元/契约测试（go test，无需 OpenWrt）**
- 本次执行覆盖的内容：
  - `homeproxy-cli/cmd/homeproxy` 包下的所有单元 + 契约测试：
    - 帮助输出（`TestHelp`）、状态（`TestStatus` / `TestStatusJSON`）、特性（`TestFeatures`）、资源版本（`TestResourcesVersion`）、ACL 列表（`TestACLList`）、生成器 UUID（`TestGeneratorUUID`）等。
    - JSON 输出相关测试：`status --json`、`node list --json`、`subscription list --json` 的结构和字段稳定性。
    - 契约测试：资源版本 / ACL 列表 / 日志清理 / generator UUID 对 `luci.homeproxy` ubus 参数的契约。
  - `homeproxy-cli/internal/system` 包的基础行为测试（如 `TestRunCommand_NotFound`）。

> 注：本记录聚焦“如何在 Docker 中跑起来”与“为何要这样跑”，不重复列出具体测试用例实现，具体断言可直接参考 `cli-go/cmd/homeproxy/main_test.go` 与 `cli-go/internal/system/exec_test.go`。

