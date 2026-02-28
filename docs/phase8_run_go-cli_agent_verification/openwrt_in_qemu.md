# 资源:
 
/etc/config/homeproxy

/etc/homeproxy/（含 ruleset / resources）

/var/run/homeproxy/（含 json / log / nft / cache.db）

/etc/init.d/homeproxy

/usr/share/rpcd/ucode/luci.homeproxy

/etc/crontabs/root

DNSMasq 配置片段文件

进程

sing-box-c

sing-box-s

log-cleaner

procd 管理实例

内核网络对象

nft chains / sets

firewall4

ip rule

ip route

ip tuntap

监听端口（TCP/UDP/TUN）

定时任务

cron 自动更新任务

IPC

UBUS 接口

隔离机制

ujail（可选）

#使用:
一、最安全情况（推荐）
✅ QEMU 使用 user-mode 网络（-net user）

示例：

qemu-system-x86_64 \
  -m 512 \
  -drive file=openwrt.img,format=raw \
  -net nic -net user \
  -nographic

这种模式下：

OpenWRT 在 QEMU 里

网络是 NAT

没有 tap

没有 bridge

不会改宿主机路由

不会改宿主机 nft

不会改宿主机 ip rule

 
# 构建 **可复用 OpenWRT QEMU 开发环境**（透明代理调试）

---

## 1️⃣ 镜像

使用：

```
x86-64 ext4-combined.img
```

不要用 squashfs。

---

## 2️⃣ 转换 qcow2

```
qemu-img convert -f raw -O qcow2 openwrt.img openwrt.qcow2
```

优点：

* 支持 snapshot
* 支持 overlay
* 可快速回滚

---

## 3️⃣ 目录结构

```
openwrt-lab/
├── images/openwrt.qcow2
├── start.sh
├── snapshot.sh
└── reset.sh
```

---

## 4️⃣ 安全启动（不影响宿主机）

```bash
qemu-system-x86_64 \
  -enable-kvm \
  -m 512 \
  -cpu host \
  -drive file=images/openwrt.qcow2,format=qcow2 \
  -net nic -net user \
  -nographic
```

特性：

* KVM 加速
* NAT 网络
* 不修改宿主机 nft / ip rule

---

## 5️⃣ 双网卡模拟

```bash
qemu-system-x86_64 \
  -enable-kvm \
  -m 1024 \
  -cpu host \
  -drive file=images/openwrt.qcow2,format=qcow2 \
  -netdev user,id=wan \
  -device e1000,netdev=wan \
  -netdev tap,id=lan,ifname=tap0,script=no,downscript=no \
  -device e1000,netdev=lan \
  -nographic
```

结构：

```
WAN → user NAT
LAN → tap0
```

---

## 6️⃣ 快照

创建：

```
qemu-img snapshot -c clean openwrt.qcow2
```

恢复：

```
qemu-img snapshot -a clean openwrt.qcow2
```

用途：

* nft
* ip rule
* 快速回滚

---

## 7️⃣ Overlay（推荐）

结构：

```
base.qcow2
dev.qcow2
```

创建：

```
qemu-img create -f qcow2 -b base.qcow2 dev.qcow2
```

优势：

* 基础镜像不变
* 多版本测试

---

## 8️⃣ 最优组合

```
x86_64
+ KVM
+ qcow2
+ snapshot
+ 双网卡
```

用途：

* TProxy
* Tun
* nft
* policy routing
* DNS 劫持

---

## 核心原则

* 调试 → x86 QEMU
* 不污染宿主机 → user 网络
* 真流量测试 → tap 双网卡
* 高复用 → qcow2 + overlay


---

如需，我可给你：

「透明代理完整实验拓扑最小模板」一页结构图版。

#x86 openwrt download 

➡️ OpenWRT releases 24.10.0 – x86/64 目录
https://downloads.openwrt.org/releases/24.10.0/targets/x86/64/

在这个目录里可以找到：

📥 推荐的镜像（可写文件系统，适合 QEMU）

generic-ext4-combined.img.gz
👉 可写 ext4 格式，适合 VM／QEMU 实验环境

generic-ext4-combined-efi.img.gz
👉 含 EFI 引导（可直接用于 UEFI VM）

# 后台启动qemu 非交互式.
方案 A：使用 SSH（推荐）

OpenWRT 默认 LAN 192.168.1.1

如果用 -net user，加端口转发：

-net user,hostfwd=tcp::2222-:22

完整例子：

qemu-system-x86_64 \
  -enable-kvm \
  -m 512 \
  -cpu host \
  -drive file=openwrt.qcow2,format=qcow2 \
  -net nic \
  -net user,hostfwd=tcp::2222-:22 \
  -nographic \
  -daemonize

然后登录：

ssh root@localhost -p 2222

