---
name: wms_inbound_create
description: "创建入库单。根据采购单或到货信息生成入库任务，校验物料与数量后提交。"
version: 0.1.0
triggers:
  - "intent:create"
  - "keyword:入库"
  - "keyword:inbound"
allowed-tools:
  - file_readFile
  - file_writeFile
  - file_generateFile
  - wms_inventory
parameters:
  type: object
  properties:
    supplier:
      type: string
      description: 供应商名称或编码
    warehouse:
      type: string
      description: 目标仓库编码
    lines:
      type: array
      description: 入库明细数组
      items:
        type: object
        properties:
          sku:
            type: string
          qty:
            type: number
          batch:
            type: string
        required:
          - sku
          - qty
    expectedAt:
      type: string
      description: 预计到货时间（可选）
  required:
    - supplier
    - warehouse
    - lines
---

# WMS 入库单创建

你负责将到货信息转化为标准入库单。

## 输入解析

提取字段：
- `supplier`：供应商名称或编码
- `warehouse`：目标仓库
- `lines`：明细数组，每项含 `sku`、`qty`、`batch?`（批次）
- `expectedAt`：预计到货时间（可选）

## 创建步骤

1. 校验每个 `sku` 是否存在于物料主数据；不存在则列出并暂停。
2. 校验 `qty` 为正数。
3. 生成入库单草稿，返回单号与待确认明细。
4. 仅在用户确认后调用提交接口。

## 注意

- 不要静默修改数量，任何缺省需明确告知用户。
- 批次缺失时提示用户补充，便于后续追溯。
