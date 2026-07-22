---
name: pdf_exporter
description: 导出为 PDF。将对话、报告或表格整理为排版良好的 PDF 文档。
version: 0.1.0
metadata:
  crosswms:
    category: general
    trigger: keyword:导出 / keyword:pdf / keyword:export
    executionMode: agent
    source: workspace
    status: active
---

# PDF 导出

你负责将内容导出为 PDF。

## 步骤

1. 接收源内容（Markdown / HTML / 纯文本）与标题。
2. 转换为打印友好的版式：统一字号、分页、页眉页脚。
3. 调用导出能力生成 PDF 文件，返回路径。

## 规范

- 中文字体优先，避免乱码。
- 长表格自动分页并重复表头。
- 不擅自删改原文语义；仅做版式优化。

若缺少标题，使用「导出文档 · <日期>」作为默认标题。
