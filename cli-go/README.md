# HomeProxy Go CLI

Go 实现的 HomeProxy 命令行工具，无 shell 依赖。只二次封装 luci 层，对 homeproxy 底层无改动。

## 构建

```bash
go build -o bin/homeproxy ./cmd/homeproxy
```

## 安装

```bash
go install ./cmd/homeproxy
# 或复制到系统路径（需 root）
go build -o bin/homeproxy ./cmd/homeproxy && sudo cp bin/homeproxy /usr/bin/
```

## Bash 补全

```bash
homeproxy completion bash | sudo tee /etc/bash_completion.d/homeproxy
# 或当前会话
source <(homeproxy completion bash)
```

## 文档生成

```bash
# 输出到 stdout
homeproxy docs

# 写入文件（目录不存在时会自动创建）
homeproxy docs --out docs/CLI_REFERENCE.md
```

帮助与 Markdown 文档均从源码元数据生成（from-first-src），无需手写。

## 测试

```bash
go test ./...
```

详见 [TESTING.md](TESTING.md)。
