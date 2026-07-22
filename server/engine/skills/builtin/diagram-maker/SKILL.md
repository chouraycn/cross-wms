---
name: diagram-maker
description: 使用 Mermaid/Excalidraw 生成流程图、架构图
version: 1.0.0
triggers:
  - keyword:流程图
  - keyword:架构图
  - keyword:时序图
  - keyword:mermaid
category: productivity
tags: diagram, mermaid, flowchart, architecture, excalidraw
metadata:
  crosswms:
    category: productivity
    executionMode: tool
    source: builtin
    status: active
---

# Diagram Maker 图表生成

使用 Mermaid 语法生成各种类型的图表，包括流程图、架构图、时序图等。

## 功能

- 流程图（Flowchart）
- 时序图（Sequence Diagram）
- 类图（Class Diagram）
- 状态图（State Diagram）
- 架构图（Architecture Diagram）
- 甘特图（Gantt Chart）
- 饼图（Pie Chart）
- 支持 Mermaid 代码导出

## 图表类型

- `flowchart` - 流程图
- `sequence` - 时序图
- `class` - 类图
- `state` - 状态图
- `gantt` - 甘特图
- `pie` - 饼图
- `architecture` - 架构图

## 使用示例

```
画一个用户登录的流程图
生成一个微服务架构图
创建一个订单处理的时序图
```

## 工具函数

- `diagram_flowchart(nodes[], edges[])` - 生成流程图
- `diagram_sequence(participants[], messages[])` - 生成时序图
- `diagram_architecture(services[], connections[])` - 生成架构图
- `diagram_render(mermaidCode)` - 渲染 Mermaid 代码
