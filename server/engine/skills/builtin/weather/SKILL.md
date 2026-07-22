---
name: weather
description: 查询全球城市天气、预报、空气质量
version: 1.0.0
triggers:
  - keyword:天气
  - keyword:天气预报
  - keyword:温度
  - keyword:空气质量
category: general
tags: weather, forecast, air-quality
metadata:
  crosswms:
    category: general
    executionMode: tool
    source: builtin
    status: active
---

# Weather 天气预报

查询全球城市的当前天气、5天预报和空气质量指数。

## 功能

- 当前天气查询（温度、湿度、风速、降水等）
- 5天天气预报
- 空气质量指数（AQI）
- 支持全球主要城市

## 使用示例

```
查询北京今天的天气
上海未来5天天气预报
深圳空气质量如何
```

## 工具函数

- `weather_current(city)` - 获取当前天气
- `weather_forecast(city, days?)` - 获取天气预报
- `weather_airquality(city)` - 获取空气质量
