# 一键 cloc 代码统计

用 [cloc](https://github.com/AlDanial/cloc) 统计项目代码行数。需先安装 cloc：

```bash
# Debian/Ubuntu
sudo apt install cloc

# macOS
brew install cloc
```

---

## 一键命令

在项目根目录执行：

### 1. 全项目统计（排除 sing-box-ref 子模块）

```bash
cloc . --exclude-dir=sing-box-ref > docs/z_others/homeproxy_cloc.md
```
```

### 2. 仅 homeproxy 核心代码（cli-go / root / htdocs / docs / po）

```bash
cloc cli-go root htdocs docs po
```

### 3. 简洁输出（无进度条）

```bash
cloc . --quiet
```

### 4. 按 Git 跟踪文件统计（忽略 .gitignore 外的大文件/构建产物）

```bash
cloc $(git ls-files)
```

---

## 一键脚本

复制到终端回车即可：

```bash
# 统计核心代码
cd "$(git rev-parse --show-toplevel)" && cloc cli-go root htdocs docs po --quiet
```

---

## 输出说明

| 列       | 含义           |
|----------|----------------|
| files    | 文件数         |
| blank    | 空行           |
| comment  | 注释行         |
| code     | 实际代码行     |
