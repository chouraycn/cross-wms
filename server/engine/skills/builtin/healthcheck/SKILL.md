---
name: healthcheck
description: 系统健康检查、依赖状态、性能指标
version: 1.0.0
triggers:
  - keyword:健康检查
  - keyword:系统状态
  - keyword:health
  - keyword:性能
category: system
tags: health, monitoring, system, performance
metadata:
  crosswms:
    category: system
    executionMode: tool
    source: builtin
    status: active
---

# Healthcheck 健康检查

系统健康检查工具，监控服务状态、依赖可用性和性能指标。

## 功能

- 系统健康状态检查
- 依赖服务状态监控
- 性能指标收集（CPU、内存、磁盘）
- 数据库连接检查
- 缓存状态检查
- 响应时间监控
- 健康报告生成

## 检查项

- 系统资源（CPU、内存、磁盘）
- 数据库连接
- 缓存服务
- 消息队列
- 外部 API
- 文件系统
- 网络连接

## 使用示例

```
系统健康检查
检查数据库连接状态
查看性能指标
生成健康报告
```

## 工具函数

- `healthcheck_status()` - 总体健康状态
- `healthcheck_system()` - 系统资源指标
- `healthcheck_dependencies()` - 依赖服务状态
- `healthcheck_performance()` - 性能指标
- `healthcheck_report()` - 生成健康报告
