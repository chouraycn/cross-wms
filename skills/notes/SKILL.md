---
name: notes
description: "笔记管理，支持创建、读取、搜索和编辑笔记"
version: 0.1.0
triggers:
  - "keyword:笔记"
  - "keyword:note"
  - "keyword:记录"
allowed-tools:
  - file_readFile
  - file_writeFile
---

# Notes 笔记管理

创建和管理个人笔记，使用 Markdown 格式存储。

## 何时使用

当用户需要：
- 创建新笔记
- 搜索现有笔记
- 编辑笔记内容
- 查看笔记列表

## 工作流程

1. 理解用户需求（创建/搜索/编辑/查看）
2. 确定笔记标题或关键词
3. 执行相应操作
4. 返回操作结果

## 笔记存储

笔记存储在 `~/.crosswms/notes/` 目录下，使用 Markdown 格式。

## 操作命令

```bash
# 创建新笔记
echo "# 笔记标题\n\n笔记内容" > ~/.crosswms/notes/my-note.md

# 列出所有笔记
ls ~/.crosswms/notes/

# 搜索笔记内容
grep -r "关键词" ~/.crosswms/notes/

# 读取笔记
cat ~/.crosswms/notes/my-note.md
```
