# HomeProxy 白名单 GitOps（Python 版）

本目录用于管理 `direct_list` 白名单，采用 **CLI-only**、**Python-only** 的 GitOps 流程。

## 目录结构

- `direct_list.txt`：白名单源文件（单一事实来源）
- `validate.py`：白名单校验脚本
- `deploy.py`：发布脚本（下发到 OpenWrt 并应用）
- `rollback.py`：按 Git 版本回滚
- `whitelist_common.py`：公共逻辑（解析、校验、风险检测）

## 白名单格式规范

- 一行一个域名
- 空行忽略
- `#` 开头为注释
- 建议全部小写
- 文件必须是 UTF-8 编码，且以换行结尾

## 本地校验

```bash
python3 ops/whitelist-gitops/validate.py
```

若确需放行高风险域名（如 `google.com`），显式使用：

```bash
python3 ops/whitelist-gitops/validate.py --force
```

校验项包括：

- 域名格式合法性
- 重复条目检查
- UTF-8 与末尾换行检查
- 高风险域名阻断（`google.com`、`youtube.com`、`googleapis.com`、`gstatic.com`、`gmail.com`）

## 发布到 OpenWrt

密码直传：

```bash
python3 ops/whitelist-gitops/deploy.py 192.168.10.1 root 'your-password'
```

环境变量传密码（推荐）：

```bash
export ROUTER_PASS='your-password'
python3 ops/whitelist-gitops/deploy.py 192.168.10.1 root env
```

带高风险域名时强制发布：

```bash
python3 ops/whitelist-gitops/deploy.py 192.168.10.1 root env --force
```

发布行为说明：

- 发布前必跑 `validate.py`
- 先生成规范化白名单再上传到路由器临时文件
- 通过 `homeproxy acl write direct_list --file ...` 应用
- 通过 `homeproxy control reload` 重载（失败回退到 `/etc/init.d/homeproxy reload`）
- 任一步失败即返回非 0
- 上传优先用 `scp`；若设备缺少 `sftp-server` 导致 `scp` 失败，自动回退为 `ssh + cat` 上传

## 回滚

按 Git 版本回滚：

```bash
export ROUTER_PASS='your-password'
python3 ops/whitelist-gitops/rollback.py <git_ref> 192.168.10.1 root env
```

示例：

```bash
python3 ops/whitelist-gitops/rollback.py HEAD~1 192.168.10.1 root env
```

## 标准 GitOps 流程

1. 修改 `direct_list.txt`
2. 本地执行 `validate.py`
3. 提 PR 并评审
4. 合并后执行发布
5. 做运行时验收

## 运行时验收（必须）

仅“配置写入成功”不算完成，必须验证真实流量路径。

最小验收建议：

1. 本次新增 1 个白名单域名
2. 在 LAN 侧发起 `curl` 请求
3. 提供至少 1 条路径证据：
   - 代理日志未命中目标连接；或
   - 防火墙直连/代理计数器呈现预期变化

## 本次已验证的操作示例（你刚执行过）

1. 在 `direct_list.txt` 增加 `google.com`
2. 执行：

```bash
python3 ops/whitelist-gitops/deploy.py 192.168.10.1 root '***' --force
```

3. 路由器执行验收：

```bash
curl -I --max-time 8 https://www.google.com
```

4. 结果为不可访问（如 `curl: (35)`），按当前实验目标判定“成功”

## 冲突策略说明

在 `bypass_mainland_china` 模式下，`direct_list` 可能覆盖默认分流行为。  
因此：

- 高风险域名默认阻断
- 仅在明确批准时使用 `--force`
- 强制发布后必须做运行时验收
