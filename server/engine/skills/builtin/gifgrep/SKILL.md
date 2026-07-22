---
name: gifgrep
description: 搜索 GIF 动图
version: 1.0.0
triggers:
  - keyword:GIF
  - keyword:gif
  - keyword:动图
  - keyword:表情包
category: media
tags: gif, search, media, image
metadata:
  crosswms:
    category: media
    executionMode: tool
    source: builtin
    status: active
---

# GifGrep GIF 搜索

搜索和获取 GIF 动图，支持关键词搜索、热门推荐和下载。

## 功能

- 关键词搜索 GIF
- 热门 GIF 推荐
- 按分类浏览
- 随机 GIF 获取
- GIF 信息预览
- 下载链接获取

## 使用示例

```
搜索猫咪的GIF
给我一个搞笑的动图
来一个庆祝的表情
有什么热门的GIF
```

## 工具函数

- `gifgrep_search(query, limit?)` - 搜索 GIF
- `gifgrep_trending(limit?)` - 热门 GIF
- `gifgrep_random(tag?)` - 随机 GIF
- `gifgrep_getById(id)` - 获取单个 GIF 详情
- `gifgrep_categories()` - 获取分类列表
