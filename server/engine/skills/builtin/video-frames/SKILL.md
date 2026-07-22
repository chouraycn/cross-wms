---
name: video-frames
description: 从视频中提取帧、生成缩略图
version: 1.0.0
triggers:
  - keyword:视频帧
  - keyword:缩略图
  - keyword:截图
  - keyword:video
category: media
tags: video, frames, thumbnail, extract, screenshot
metadata:
  crosswms:
    category: media
    executionMode: tool
    source: builtin
    status: active
---

# Video Frames 视频帧提取

从视频文件中提取帧、生成缩略图和预览图。

## 功能

- 提取指定时间点的帧
- 批量提取关键帧
- 生成视频缩略图
- 生成帧预览网格
- 视频信息获取
- 支持多种输出格式

## 使用示例

```
从第30秒提取一帧
生成视频的缩略图
提取视频的所有关键帧
创建帧预览网格
这个视频有多长
```

## 工具函数

- `video_frames_extract(file, time)` - 提取指定时间帧
- `video_frames_batch(file, interval?, count?)` - 批量提取帧
- `video_frames_thumbnail(file)` - 生成缩略图
- `video_frames_grid(file, cols?, rows?)` - 生成帧网格
- `video_frames_info(file)` - 获取视频信息
