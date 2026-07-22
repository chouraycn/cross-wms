---
name: blogwatcher
description: 订阅和监控 RSS 源、博客更新
version: 1.0.0
triggers:
  - keyword:RSS
  - keyword:博客
  - keyword:订阅
  - keyword:feed
category: productivity
tags: rss, blog, feed, subscription, monitoring
metadata:
  crosswms:
    category: productivity
    executionMode: tool
    source: builtin
    status: active
---

# BlogWatcher RSS/博客订阅

订阅和监控 RSS 源、博客更新，支持多源管理和更新通知。

## 功能

- 添加/删除 RSS 订阅源
- 查看订阅列表
- 获取最新文章
- 监控博客更新
- 文章搜索和过滤
- 未读计数管理

## 使用示例

```
添加这个博客的RSS订阅
查看我的订阅列表
有什么新文章
搜索关于AI的文章
标记所有为已读
```

## 工具函数

- `blogwatcher_addFeed(url, name?)` - 添加订阅源
- `blogwatcher_removeFeed(id)` - 删除订阅源
- `blogwatcher_listFeeds()` - 列出所有订阅
- `blogwatcher_getLatest(feedId?, limit?)` - 获取最新文章
- `blogwatcher_markRead(articleId)` - 标记为已读
- `blogwatcher_search(query)` - 搜索文章
