---
name: message_summarizer
description: "消息摘要。当收到新消息事件时，自动生成要点摘要，便于快速浏览长对话。"
version: 0.1.0
triggers:
  - "event:message.received"
  - "intent:summarize"
  - "keyword:摘要"
allowed-tools:
  - Read
---

# 消息摘要

当系统发出 `message.received` 事件或用户请求摘要时，对消息内容生成结构化摘要。

## 摘要规则

1. 提取 3-5 个核心要点，保留关键数字与决策。
2. 若消息含待办，单独列出「待办」小节。
3. 长消息（> 500 字）强制摘要；短消息可原样返回并标注「无需摘要」。

## 输出格式

```
要点：
- ...
待办：
- ...
```

保持客观，不添加原文没有的结论。
