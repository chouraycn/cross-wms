---
name: 飞利浦 Hue 智能灯
id: openhue
description: 通过 OpenHue CLI 控制飞利浦 Hue 灯光与场景
group: integration
requires: {}
userInvocable: true
gate: auto
sandboxScope: write
---

使用 `openhue` 通过 Hue Bridge 控制飞利浦 Hue 灯光与场景。

## 何时使用

适用于：

- "开/关灯"
- "把客厅灯调暗"
- "设置场景"或"观影模式"
- 控制特定 Hue 房间或区域
- 调节亮度、颜色或色温

## 何时不使用

不适用于：

- 非 Hue 智能设备（其他品牌）-> 不支持
- HomeKit 场景或快捷指令 -> 使用 Apple 生态
- 电视或娱乐系统控制
- 恒温器或 HVAC
- 智能插座（Hue 智能插座除外）

## 常用命令

### 列出资源

```bash
openhue get light       # 列出所有灯
openhue get room        # 列出所有房间
openhue get scene       # 列出所有场景
```

### 控制灯光

```bash
# 开/关
openhue set light "Bedroom Lamp" --on
openhue set light "Bedroom Lamp" --off

# 亮度（0-100）
openhue set light "Bedroom Lamp" --on --brightness 50

# 色温（暖到冷：153-500 mirek）
openhue set light "Bedroom Lamp" --on --temperature 300

# 颜色（名称或十六进制）
openhue set light "Bedroom Lamp" --on --color red
openhue set light "Bedroom Lamp" --on --rgb "#FF5500"
```

### 控制房间

```bash
# 关闭整个房间
openhue set room "Bedroom" --off

# 设置房间亮度
openhue set room "Bedroom" --on --brightness 30
```

### 场景

```bash
# 激活场景
openhue set scene "Relax" --room "Bedroom"
openhue set scene "Concentrate" --room "Office"
```

## 快捷预设

```bash
# 睡前（暗暖光）
openhue set room "Bedroom" --on --brightness 20 --temperature 450

# 工作模式（亮冷光）
openhue set room "Office" --on --brightness 100 --temperature 250

# 观影模式（暗光）
openhue set room "Living Room" --on --brightness 10
```

## 注意事项

- Bridge 必须在同一局域网内
- 首次使用需按 Hue Bridge 上的按钮完成配对
- 颜色仅适用于支持彩色的灯泡（非纯白灯泡）
