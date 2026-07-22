---
name: session-logs
description: 查看和分析历史会话日志
version: 1.0.0
triggers:
  - keyword:会话日志
  - keyword:历史记录
  - keyword:聊天记录
  - keyword:session
category: utilities
tags: logs, session, history, chat
metadata:
  crosswms:
    category: utilities
    executionMode: tool
    source: builtin
    status: active
---

# Session Logs 会话日志

查看和分析历史会话日志，支持搜索、过滤和统计分析。

## 功能

- 查看历史会话列表
- 搜索会话内容
- 按时间范围过滤
- 会话统计分析
- 导出会话记录
- 会话主题分类

## 使用示例

```
查看最近的会话记录
搜索关于项目的讨论
统计本周的会话数量
导出昨天的聊天记录
```

## 工具函数

- `session_logs_list(limit?, offset?)` - 列出会话
- `session_logs_get(sessionId)` - 获取单条会话详情
- `session_logs_search(query, dateFrom?, dateTo?)` - 搜索会话
- `session_logs_stats(dateFrom?, dateTo?)` - 会话统计
- `session_logs_export(sessionId, format?)` - 导出会话
