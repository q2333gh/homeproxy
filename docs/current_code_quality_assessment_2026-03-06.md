# HomeProxy 当前源码代码质量调查（2026-03-06）

## 1. 调查范围

本次评估聚焦仓库中的“自有可执行源码”，不把以下内容直接计入代码质量结论：

- `sing-box-ref/`：大型参考源码目录，属于上游参考，不代表本工程日常维护质量
- `docs/`：文档
- `dist/`：构建产物
- `root/etc/homeproxy/resources/*.txt`、`*.ver`：资源数据文件

重点检查对象：

- LuCI 前端：`htdocs/luci-static/resources/view/homeproxy/*.js`
- OpenWrt 运行时脚本：`root/etc/homeproxy/scripts/*`、`root/etc/init.d/homeproxy`
- RPC 后端：`root/usr/share/rpcd/ucode/luci.homeproxy`
- Go CLI：`cli-go/`

## 2. 调查方法

执行了以下检查：

- `cloc cli-go htdocs root/etc/homeproxy/scripts root/usr/share/rpcd root/usr/share/luci --exclude-ext=txt,ver,json,po,md`
- `go test ./...`
- `go test ./... -cover`（目录：`cli-go/`）
- `sh -n root/etc/init.d/homeproxy`
- 人工抽查核心大文件、RPC 接口、CI 配置和测试布局

## 3. 量化结果

自有可执行源码约 6960 行：

- JavaScript：3721 LOC
- Go：3149 LOC
- Shell：90 LOC

体量最集中的文件：

- `htdocs/luci-static/resources/view/homeproxy/client.js`：1548 行
- `htdocs/luci-static/resources/view/homeproxy/node.js`：1465 行
- `root/etc/homeproxy/scripts/generate_client.uc`：975 行
- `htdocs/luci-static/resources/view/homeproxy/server.js`：887 行
- `root/etc/homeproxy/scripts/update_subscriptions.uc`：669 行

测试现状：

- `cli-go` 的 `go test ./...` 当前可通过
- `cli-go` 覆盖率较低：`cmd/homeproxy` 22.9%，`internal/system` 20.8%
- 非 Go 部分目前没有看到自动化测试

## 4. 总体判断

结论：代码质量处于“中等，可维护但风险分布不均”的状态。

优点在于：

- 子系统边界基本清楚，LuCI、rpcd、init、CLI 的职责划分明显
- Go CLI 代码结构相对整洁，命令入口清晰，已有 mock/contract test 思路
- 运行时脚本在启动前会生成并校验 sing-box 配置，具备基本防呆

主要短板在于：

- 风险高度集中在少数超长文件
- 非 Go 关键路径几乎没有自动化保护
- CI 偏重“能打包”，对“能否正确运行/重构”保护不足

## 5. 主要优点

### 5.1 Go CLI 结构相对健康

`cli-go/cmd/homeproxy/main.go` 入口简单直接，命令路由明确；`cli-go/internal/system/exec.go` 将命令执行抽象为可替换实现，便于测试。

对应测试也不是纯展示性测试，已经包含契约测试思路，例如：

- `cli-go/cmd/homeproxy/main_test.go`
- `cli-go/cmd/homeproxy/sharelink_test.go`
- `cli-go/internal/system/exec_test.go`

这部分说明新引入的 Go CLI 已经有较好的工程化起点。

### 5.2 运行时启动链路具备基本防护

`root/etc/init.d/homeproxy` 在启动客户端/服务端前，会先生成配置，再调用 `sing-box check --config` 校验配置有效性。这一点能显著降低“配置拼装错误导致服务直接起不来但难定位”的风险。

### 5.3 仓库已有一定发布与问题收集规范

`.github/ISSUE_TEMPLATE/*` 和 `.github/workflows/build-ipk.yml` 说明仓库在发布、收集缺陷、构建产物方面已有基本流程，不是完全手工维护状态。

## 6. 主要问题

### 6.1 高优先级：`generate_client.uc` 中存在明显条件判断缺陷

文件：`root/etc/homeproxy/scripts/generate_client.uc`

以下两处写法明显可疑：

- 第 124 行：`if (match(proxy_mode), /tproxy/)`
- 第 127 行：`if (match(proxy_mode), /tun/) {`

按正常意图，这里应当是 `match(proxy_mode, /tproxy/)` 与 `match(proxy_mode, /tun/)`。当前写法更像误用了逗号表达式，存在把条件判断变成“恒为真或与预期不符”的风险，直接影响：

- `tproxy_port` 是否被设置
- `tun_name/tun_addr4/tun_addr6/tun_mtu` 等分支是否被错误进入

这已经不是“可维护性问题”，而是潜在逻辑缺陷，应优先修复并补回归测试。

### 6.2 高优先级：关键业务逻辑集中在超长文件，维护成本过高

典型文件：

- `htdocs/luci-static/resources/view/homeproxy/client.js`
- `htdocs/luci-static/resources/view/homeproxy/node.js`
- `root/etc/homeproxy/scripts/generate_client.uc`

这些文件都承担了过多职责，例如：

- UI 定义、依赖关系、校验逻辑、运行状态展示混在同一文件
- 配置读取、默认值决策、sing-box 结构拼装集中在一个 ucode 文件
- 许多字段映射是手写平铺对象，修改时很难确认影响面

结果是：

- review 成本高
- 回归风险高
- 很难为局部逻辑补测试
- 新人接手门槛高

这类“God file” 当前是仓库最主要的长期维护风险。

### 6.3 高优先级：自动化测试严重偏科，关键路径没有保护

当前可见测试只覆盖 `cli-go`：

- `cli-go/cmd/homeproxy/args_test.go`
- `cli-go/cmd/homeproxy/main_test.go`
- `cli-go/cmd/homeproxy/sharelink_test.go`
- `cli-go/internal/system/exec_test.go`

但真正高风险的部分其实是：

- LuCI 表单联动与校验
- `ucode` 配置生成
- `init.d` 启停、副作用、路由/防火墙联动
- `rpcd` 方法参数处理

这些都没有自动化测试。当前 Go 覆盖率只有 20% 出头，也说明即便在 Go 子项目内，测试保护仍处于早期阶段。

### 6.4 中优先级：CI 只做构建，不做质量闸门

文件：`.github/workflows/build-ipk.yml`

当前 workflow 会：

- 安装依赖
- 构建 CLI 包和主包
- 上传产物

但没有看到以下质量闸门：

- `go test ./...`
- 覆盖率阈值
- shell/JS/ucode 的静态检查
- 最小化集成验证

这意味着：

- 测试即便存在，也不会阻止问题进入主分支
- 重构质量主要依赖人工自觉
- 非 Go 代码几乎没有自动保护

### 6.5 中优先级：缺少统一的静态检查与格式约束

仓库根目录下未见本工程自己的：

- `.editorconfig`
- `eslint`/`prettier` 配置
- `golangci-lint` 配置
- `shellcheck` 配置

唯一搜到的 `.golangci.yml` 位于 `sing-box-ref/`，不应视为本工程质量基线。

这会导致不同语言子系统各自按个人习惯演进，时间久了风格和质量约束会继续漂移。

### 6.6 中优先级：RPC 后端存在命令拼接硬化不足问题

文件：`root/usr/share/rpcd/ucode/luci.homeproxy`

`singbox_generator` 中存在如下模式：

- `/usr/bin/sing-box generate ` + `type` + `params`

其中 `type` 做了白名单限制，但 `params` 直接拼接进 shell 命令。虽然这是管理面接口，不是公网接口，但仍然属于典型的“输入硬化不足”，会带来：

- 调试期偶发命令解析问题
- 参数转义不一致问题
- 后续扩展时引入注入风险

从代码质量角度看，这属于需要收敛的技术债。

## 7. 风险排序

建议按下面顺序处理：

1. 修复 `generate_client.uc` 的条件判断问题，并补测试
2. 拆分 `client.js` / `node.js` / `generate_client.uc`
3. 把 `go test ./...` 接入 CI
4. 增加 `ucode` 配置生成和 RPC 接口的回归测试
5. 建立最小静态检查基线（至少 Go + Shell）

## 8. 建议的改进路线

### 第一阶段：止血

- 修复 `root/etc/homeproxy/scripts/generate_client.uc` 中第 124、127 行的条件判断
- 为该文件补最小回归样例，至少覆盖 `redirect_tproxy`、`redirect_tun`、`tun` 三种模式
- 在 CI 中加入 `cd cli-go && go test ./...`

### 第二阶段：降低维护成本

- 将 `client.js` 按“基础设置 / DNS / 路由 / 状态栏 / 校验器”拆分
- 将 `node.js` 按协议类型拆分或引入字段定义表
- 将 `generate_client.uc` 拆成“读取配置 / 组装 outbound / 组装 dns / 组装 route / 输出 JSON”几个模块

### 第三阶段：补齐工程化

- 增加 shell 静态检查和基本格式约束
- 为 RPC 方法增加参数级测试
- 建立最小 OpenWrt/QEMU 冒烟测试，验证生成配置、启动、状态读取三条主链路

## 9. 最终结论

如果把 `sing-box-ref` 这类参考目录剔除后再看，HomeProxy 当前最值得肯定的是 Go CLI 子项目已经具备比较像样的工程化雏形；最需要警惕的是，真正承载核心业务复杂度的 LuCI/ucode/runtime 脚本仍然主要依赖人工维护，且已经出现了疑似真实逻辑缺陷。

因此，本工程当前不属于“代码质量差到不可维护”，但也还没有达到“可以放心快速演进”的状态。更准确的判断是：

- Go CLI：中上
- LuCI/ucode/runtime：中等偏下
- 仓库整体：中等

如果先修掉 `generate_client.uc` 的判断问题，再把 CI 测试闸门补上，整体质量会立刻上一个台阶。
