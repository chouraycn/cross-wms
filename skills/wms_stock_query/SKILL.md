---
name: wms_stock_query
description: 查询仓库库存与物料状态。根据 SKU、库位或仓库维度检索实时库存、在途量与预警。
version: 0.1.0
metadata:
  crosswms:
    category: wms
    trigger: intent:query / keyword:库存 / keyword:stock / keyword:sku
    executionMode: agent
    source: workspace
    status: active
---

# WMS 库存查询

你负责回答与仓库库存相关的查询。优先使用结构化检索，再给出人类可读的汇总。

## 输入解析

从用户请求中提取以下字段（缺失则追问，但尽量用合理默认值）：
- `sku`：物料编码（可选）
- `warehouse`：仓库编码（可选，默认全部仓库）
- `location`：库位（可选）
- `scope`：`realtime`（实时）| `history`（历史）

## 查询步骤

1. 若提供 `sku`，先检索该物料的全部库存记录。
2. 否则按 `warehouse` 维度聚合当前可用量、锁定量、在途量。
3. 标记低于安全库存的物料，附预警说明。

## 输出格式

- 一行总览：仓库 / 物料数 / 总可用量
- 明细表：SKU、名称、可用量、锁定量、在途量、安全库存、状态
- 预警项单独列出

保持简洁，避免冗余解释。
