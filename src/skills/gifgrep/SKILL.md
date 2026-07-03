---
name: GIF 搜索
id: gifgrep
description: 搜索 GIF 提供商（Tenor/Giphy），下载结果并提取静帧与缩略图
group: media
requires: {}
userInvocable: true
gate: auto
sandboxScope: none
---

使用 `gifgrep` 搜索 GIF 提供商（Tenor/Giphy），在 TUI 中浏览，下载结果并提取静帧或缩略图。

## GIF-Grab（gifgrep 工作流）

搜索 -> 预览 -> 下载 -> 提取（静帧/缩略图），便于快速查看与分享。

## 快速开始

- `gifgrep cats --max 5`
- `gifgrep cats --format url | head -n 5`
- `gifgrep search --json cats | jq '.[0].url'`
- `gifgrep tui "office handshake"`
- `gifgrep cats --download --max 1 --format url`

## TUI 与预览

- TUI：`gifgrep tui "query"`
- CLI 静帧预览：`--thumbs`（仅 Kitty/Ghostty；显示静帧）

## 下载与定位

- `--download` 保存到 `~/Downloads`
- `--reveal` 在 Finder 中显示最近一次下载

## 静帧与缩略图

- `gifgrep still ./clip.gif --at 1.5s -o still.png`
- `gifgrep sheet ./clip.gif --frames 9 --cols 3 -o sheet.png`
- sheet（缩略图）= 采样帧的单张 PNG 网格（适合快速查看、文档、PR、聊天）。
- 可调参数：`--frames`（数量）、`--cols`（网格宽度）、`--padding`（间距）。

## 提供商

- `--source auto|tenor|giphy`
- `--source giphy` 需要 `GIPHY_API_KEY`
- `TENOR_API_KEY` 可选（未设置时使用 Tenor 演示 key）

## 输出

- `--json` 打印结果数组（`id`、`title`、`url`、`preview_url`、`tags`、`width`、`height`）
- `--format` 输出便于管道处理的字段（如 `url`）

## GIF 资源规范

- 在推荐或使用动态 GIF URL 之前，先验证其可正常访问、`Content-Type: image/gif`、且确为动态（多帧或循环元数据；可用 `file`、`identify` 或小脚本检查）。
- 一并记录署名/许可/来源 URL。
- 需要本地资源时不要外链：下载/复制到项目中并引用本地文件。

## 环境调整

- `GIFGREP_SOFTWARE_ANIM=1` 强制软件动画
- `GIFGREP_CELL_ASPECT=0.5` 调整预览几何
