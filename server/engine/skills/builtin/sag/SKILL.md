---
name: sag
description: 在代码库中进行语义搜索
version: 1.0.0
triggers:
  - keyword:代码搜索
  - keyword:语义搜索
  - keyword:sag
  - keyword:找代码
category: development
tags: search, code, semantic, development
metadata:
  crosswms:
    category: development
    executionMode: tool
    source: builtin
    status: active
---

# SAG 代码语义搜索

在代码库中进行智能语义搜索，支持自然语言查询，快速定位相关代码。

## 功能

- 语义代码搜索
- 函数/方法查找
- 按功能描述搜索代码
- 支持多语言
- 搜索结果排名
- 代码上下文预览

## 使用示例

```
搜索用户认证相关的代码
找一下处理数据库查询的函数
搜索API路由定义
查找错误处理相关的代码
```

## 工具函数

- `sag_search(query, language?)` - 语义搜索代码
- `sag_findFunction(name)` - 按名称查找函数
- `sag_searchByPattern(pattern)` - 按模式搜索
- `sag_getContext(file, line, range?)` - 获取代码上下文
