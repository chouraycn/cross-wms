---
name: 蓝牙设备管理
id: blucli
description: 通过 blueutil 管理 macOS 蓝牙：电源开关、扫描、配对、连接与设备查询
group: integration
requires: { bins: ["blueutil"] }
userInvocable: true
gate: auto
sandboxScope: read
---

使用 `blueutil` 控制 macOS 蓝牙。查询类操作可直接执行；配对、连接、电源等写操作需先确认目标设备地址再执行。

## 状态与电源

```bash
blueutil --power              # 查看蓝牙电源状态（on/off）
blueutil power on             # 开启蓝牙
blueutil power off            # 关闭蓝牙
blueutil power toggle         # 切换电源
blueutil status               # 蓝牙整体状态
```

## 设备列表

```bash
blueutil --paired                  # 列出已配对设备
blueutil --connected               # 列出已连接设备
blueutil --inquiry                 # 扫描附近可发现设备（默认 10s）
blueutil --inquiry 5               # 扫描 5 秒
blueutil --info <address>          # 查看指定设备详情
blueutil --is-connected <address>  # 查询设备连接状态
```

## 连接管理

```bash
blueutil --connect <address>     # 连接设备
blueutil --disconnect <address>  # 断开设备
blueutil --pair <address>        # 配对（可能需要 PIN）
blueutil --unpair <address>      # 取消配对
```

## 输出与脚本

- 脚本场景优先使用 `--format json` 获取结构化输出。
- 设备地址为 MAC 地址，如 `aa:bb:cc:dd:ee:ff`。
- 配对/连接属写操作，执行前确认目标 `<address>`，避免误操作。
- 关闭蓝牙电源会断开所有已连接设备，谨慎使用。
