**现在在执行层直接对 UCI 做 CRUD 的主要是两类代码：**

- **ucode 脚本（主力）**  
  - 文件例如：  
    - `root/etc/homeproxy/scripts/generate_client.uc`  
    - `root/etc/homeproxy/scripts/generate_server.uc`  
    - `root/etc/homeproxy/scripts/update_subscriptions.uc`  
    - `root/etc/homeproxy/scripts/migrate_config.uc`  
    - `root/etc/homeproxy/scripts/firewall_pre.uc` / `firewall_post.ut`  
  - 它们通过 `uci` 模块的 `cursor()` 拿到句柄，然后调用 `uci.get` / `uci.set` / `uci.add` / `uci.delete` / `uci.commit` 等对 `/etc/config/homeproxy` 做增删改查，例如：

```12:23:root/etc/homeproxy/scripts/migrate_config.uc
const uci = cursor();
...
const uciconfig = 'homeproxy';
uci.load(uciconfig);

...
if (uci.get(uciconfig, uciinfra, 'china_dns_port'))
	uci.delete(uciconfig, uciinfra, 'china_dns_port');
...
uci.set(uciconfig, ucimain, 'china_dns_server', china_dns_server[0]);
```

- **少量 shell 脚本 + init 脚本间接操作 UCI**  
  - 如 `root/etc/init.d/homeproxy`、`root/etc/uci-defaults/luci-homeproxy` 等，用 `config_get`/`uci` 命令读取或写入配置，但真正的业务 CRUD 主要还是在上面的 ucode。

如果把“执行层”理解为 Web 之后直接驱动 sing-box / 防火墙 / UCI 的那一层，那么：  
**核心 CRUD 语言是 ucode，辅以少量 POSIX shell；Go CLI 和 LuCI JS 只是通过 ubus/命令行去间接触发这些 ucode/shell。**