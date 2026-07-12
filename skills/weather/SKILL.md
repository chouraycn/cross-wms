---
name: weather
description: "查询天气和天气预报，支持当前天气、温度、降水、风速等信息"
version: 0.1.0
triggers:
  - "keyword:天气"
  - "keyword:天气预报"
  - "keyword:温度"
  - "keyword:下雨"
allowed-tools:
  - file_execCommand
---

# Weather 天气查询

使用 wttr.in 服务查询全球天气信息，支持当前天气、温度、降水、风速等。

## 何时使用

当用户询问以下内容时使用本技能：
- 天气情况、温度、降水
- 天气预报、出行计划
- 特定城市/地区的天气

## 工作流程

1. 获取用户查询的地点（城市名、机场代码或坐标）
2. 使用 curl 调用 wttr.in API
3. 解析返回的 JSON 数据
4. 向用户汇报天气信息

## 查询命令

```bash
curl --fail --silent --show-error --max-time 20 "https://wttr.in/London?format=j2"
```

## 常用格式

- `format=j2`: JSON 格式，包含当前天气和预报
- `format=3`: 简短格式（地点+温度）
- `format=%l:+%c+%t`: 自定义格式

## 返回字段

- `current_condition[0].weatherDesc[0].value`: 天气状况
- `current_condition[0].temp_C`: 温度（摄氏度）
- `current_condition[0].FeelsLikeC`: 体感温度
- `current_condition[0].precipMM`: 降水量
- `current_condition[0].humidity`: 湿度
- `current_condition[0].windspeedKmph`: 风速
