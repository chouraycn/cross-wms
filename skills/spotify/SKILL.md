---
name: spotify
description: "Spotify 音乐控制，支持播放、暂停、跳过、搜索歌曲"
version: 0.1.0
triggers:
  - "keyword:spotify"
  - "keyword:音乐"
  - "keyword:播放"
  - "keyword:song"
allowed-tools:
  - file_execCommand
---

# Spotify 音乐控制

使用 Spotify CLI 控制音乐播放，支持播放、暂停、跳过、搜索等操作。

## 何时使用

当用户需要：
- 播放/暂停音乐
- 跳过歌曲（上一首/下一首）
- 搜索歌曲或专辑
- 查看当前播放状态
- 创建或切换播放列表

## 依赖

需要安装 Spotify CLI 工具：
```bash
# macOS
brew install spotify-tui spotifyd

# Linux
sudo apt install spotify-client
```

## 操作命令

```bash
# 播放/暂停
spotify play
spotify pause
spotify toggle

# 跳过歌曲
spotify next
spotify prev

# 搜索歌曲
spotify search "song name"

# 当前状态
spotify status

# 音量控制
spotify volume up
spotify volume down
spotify volume 50

# 播放列表
spotify playlist list
spotify playlist play "My Playlist"
```

## 注意事项

- 需要登录 Spotify 账号
- 确保 Spotify 客户端正在运行
- 支持远程控制已登录的设备
