---
name: wms_outbound_create
description: 创建出库单。根据订单需求生成出库任务，支持波次拣货、库位分配与库存锁定。
version: 0.1.0
metadata:
  crosswms:
    category: wms
    trigger: intent:outbound / keyword:出库 / keyword:拣货 / keyword:picking
    executionMode: agent
    source: workspace
    status: active
---

# WMS 出库创建

你负责根据用户提供的订单或出库需求，创建结构化的出库单并执行库存锁定。

## 输入解析

从用户请求中提取以下字段：
- `orderNo`：关联订单号（必填）
- `warehouse`：仓库编码（必填）
- `items`：出库明细列表，每项含 SKU、数量
- `priority`：优先级（普通/加急，默认普通）
- `pickStrategy`：拣货策略（FIFO/FEFO/指定批次，默认 FIFO）

## 处理步骤

1. 校验订单号是否已存在出库单（防重复）
2. 逐项检查库存可用量，不足时提示缺口
3. 按 `pickStrategy` 分配库位和批次
4. 锁定分配的库存（从可用量扣减到锁定量）
5. 生成出库单号（格式：OB-yyyyMMdd-NNNN）
6. 若订单明细超过 20 行，建议拆分为波次

## 输出格式

```
出库单号：OB-20260814-0001
仓库：WH-001
关联订单：SO-20260814-1234
拣货策略：FIFO
优先级：普通

| 行号 | SKU | 名称 | 需求量 | 分配库位 | 批次 | 状态 |
|------|-----|------|--------|----------|------|------|
| 1    | A001 | ...  | 100    | A-01-03  | B202608 | 已分配 |

库存锁定：共锁定 350 件
```

若库存不足，在末尾标注缺口明细。
