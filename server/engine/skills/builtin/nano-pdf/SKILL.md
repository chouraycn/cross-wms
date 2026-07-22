---
name: nano-pdf
description: PDF 合并、分割、提取文本、转换
version: 1.0.0
triggers:
  - keyword:PDF
  - keyword:pdf
  - keyword:合并PDF
  - keyword:提取文本
category: utilities
tags: pdf, merge, split, extract, convert
metadata:
  crosswms:
    category: utilities
    executionMode: tool
    source: builtin
    status: active
---

# Nano PDF PDF 工具

轻量级 PDF 处理工具，支持合并、分割、文本提取和格式转换。

## 功能

- 合并多个 PDF 文件
- 分割 PDF 为多个文件
- 提取 PDF 中的文本内容
- PDF 与图片格式互转
- 获取 PDF 元信息（页数、大小等）

## 使用示例

```
合并这两个PDF文件
从第3页到第5页分割PDF
提取这个PDF的文本
PDF有多少页
```

## 工具函数

- `pdf_merge(files[])` - 合并多个 PDF
- `pdf_split(file, startPage, endPage)` - 分割 PDF
- `pdf_extractText(file)` - 提取文本
- `pdf_info(file)` - 获取 PDF 信息
- `pdf_toImages(file)` - PDF 转图片
