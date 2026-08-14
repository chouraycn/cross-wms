---
name: wms_transfer_create
description: 创建调拨单。在仓库间或库位间转移库存，支持整托调拨、部分调拨与在途追踪。
version: 0.1.0
metadata:
  crosswms:
    category: wms
    trigger: intent:transfer / keyword:调拨 / keyword:移库 / keyword:transfer
    executionMode: agent
    source: workspace
    status: active
---

# WMS 调拨创建

你负责根据用户需求创建仓库间或库位间的库存调拨单。

## 输入解析

- `fromWarehouse`：源仓库编码（必填）
- `toWarehouse`：目标仓库编码（必填）
- `items`：调拨明细，每项含 SKU、数量
- `transferType`：调拨类型（仓库间/库位间，默认仓库间）
- `fromLocation`：源库位（库位间调拨时必填）
- `toLocation`：目标库位（库位间调拨时必填）
- `urgent`：是否加急（默认 false）

## 处理步骤

1. 校验源仓库与目标仓库不同
2. 检查源仓库库存可用量是否充足
3. 锁定源仓库库存（从可用量移至锁定量）
4. 生成调拨单号（格式：TF-yyyyMMdd-NNNN）
5. 创建在途记录（源仓库减库存 → 在途 → 目标仓库加库存）
6. 若为加急，标注优先处理标记

## 输出格式

```
调拨单号：TF-20260814-0001
类型：仓库间调拨
源仓库：WH-001 → 目标仓库：WH-002
加急：否

| 行号 | SKU | 名称 | 调拨量 | 源库位 | 目标库位 | 状态 |
|------|-----|------|--------|--------|----------|------|
| 1    | A001 | ...  | 200    | A-01-03 | B-02-05  | 已锁定 |

在途追踪：调拨出库后可在 WH-002 入库验收
```

若源仓库库存不足，标注缺口并建议部分调拨量。
