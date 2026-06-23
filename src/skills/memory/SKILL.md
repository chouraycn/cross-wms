---
name: 记忆搜索
id: memory_search
description: 搜索 Agent 长期记忆库中的语义相关内容
group: memory
parameters:
  type: object
  required: [query]
  properties:
    query:
      type: string
      description: 搜索查询
    limit:
      type: number
      default: 5
      description: 返回结果数量
requires:
  os: [linux, darwin, win32]
userInvocable: true
gate: auto
sandboxScope: workspace
---

在 Agent 向量记忆库中执行语义搜索，返回最相关的历史对话片段和知识条目。
