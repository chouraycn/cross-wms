---
name: web-search
description: "网络搜索，支持 DuckDuckGo 和其他搜索引擎"
version: 0.1.0
triggers:
  - "keyword:搜索"
  - "keyword:查找"
  - "keyword:web"
  - "keyword:internet"
allowed-tools:
  - web_search
---

# Web Search 网络搜索

使用 DuckDuckGo 进行网络搜索，获取最新信息和知识。

## 何时使用

当用户需要：
- 搜索互联网信息
- 获取最新新闻
- 查找技术文档
- 查询产品信息
- 获取知识解答

## 操作命令

```bash
# 使用 DuckDuckGo 搜索
curl -sL "https://html.duckduckgo.com/html/?q=search+query" | grep -oP '<a href="https://duckduckgo.com/l/?uddg=\K[^"]+' | head -10

# 使用 ddgr (DuckDuckGo CLI)
ddgr "search query" --num=5

# 搜索并获取摘要
ddgr "search query" --json | jq '.results[] | {title, url, snippet}'
```

## 返回格式

搜索结果包含：
- 标题 (title)
- URL (url)
- 摘要 (snippet)

## 注意事项

- 优先使用官方 API 或 CLI 工具
- 对于复杂查询，使用高级搜索语法
- 注意信息的时效性和可靠性
- 对于技术问题，可以搜索 Stack Overflow
