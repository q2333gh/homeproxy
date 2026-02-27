---
name: Remove cli Go-only install
overview: 删除 cli/ 文件夹，将安装逻辑迁移到 cli-go/，仅安装 Go 版 CLI，移除 shell 回退。
todos: []
isProject: false
---

# 删除 cli/ 并迁移为 Go CLI 专用安装

## 现状

- [cli/install.sh](cli/install.sh)：优先 Go，失败时回退到 shell；复制 [cli/etc/homeproxy.conf](cli/etc/homeproxy.conf) 到 `/etc/homeproxy/cli.conf`
- Go CLI 不依赖 `cli.conf`，路径写死在 [cli-go/internal/system/system.go](cli-go/internal/system/system.go)

## 变更

### 1. 迁移 install.sh 到 cli-go/

- 将 [cli/install.sh](cli/install.sh) 移动到 `cli-go/install.sh`
- 将 `SCRIPT_ROOT` 改为 `"$(cd "$(dirname "$0")/.." && pwd)"`（仓库根目录）

### 2. 简化 install.sh（Go 专用）

- 删除 `install_shell_cli()` 及所有 shell 回退逻辑
- 删除 `CONFIG_DIR` 和 `cli.conf` 复制（Go CLI 不使用）
- 保留：`mkdir -p "$CONFIG_DIR"` 也可移除（`/etc/homeproxy` 由 HomeProxy 包创建）
- 新逻辑：若 `go build` 失败则报错退出，不再回退
- 保留 bash completion 内联逻辑

### 3. 更新 install.sh 核心逻辑

```sh
# 替换第 33-46 行
log_info "Installing HomeProxy CLI..."

if ! command -v go >/dev/null 2>&1; then
    log_error "Go is required. Please install Go first."
    exit 1
fi

if ! (cd "$SCRIPT_ROOT/cli-go" && go build -o homeproxy ./cmd/homeproxy); then
    log_error "Go build failed"
    exit 1
fi

log_info "Installing Go CLI..."
cp "$SCRIPT_ROOT/cli-go/homeproxy" "$BIN_DIR/homeproxy"
chmod +x "$BIN_DIR/homeproxy"
```

- 删除第 48-57 行 `install_shell_cli()` 定义
- 删除第 59-61 行 “Install configuration” 段（`cp cli.conf`）

### 4. 更新文档

- [docs/cli-enhancement-plan.md](docs/cli-enhancement-plan.md) 第 197 行：`./cli/install.sh` 改为 `./cli-go/install.sh`
- [cli-go/README.md](cli-go/README.md)（若有）：补充安装说明，指向 `cli-go/install.sh`

### 5. 删除 cli/

- 删除整个 `cli/` 目录（homeproxy、lib/*.sh、etc/homeproxy.conf、README.md 等）

### 6. 可选：README 迁移

- [cli/README.md](cli/README.md) 中的安装/用法可并入仓库根 README 或新建 `cli-go/README.md`

## 影响

- 无 Go 或构建失败时，安装将失败（不再回退到 shell CLI）
- `/etc/homeproxy/cli.conf` 不再被复制（原仅供 shell CLI 使用）
- 需要 Go 环境才能完成 CLI 安装
