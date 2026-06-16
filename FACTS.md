# FACTS.md — 仓库 / SKU 信息分层

> 最后一次修订：2026-06-16
> 数据库：`~/.cdf-know-clow/chat.db` (SQLite)

---

## 一、领域实体分层

```
┌─────────────────────────────────────────────────┐
│                   Warehouse                      │
│  id, name, country, city, 容量/库位, 状态        │
├─────────────────────────────────────────────────┤
│                    Partner                       │
│  id, name, type(supplier|customer), contact      │
├──────────────┬──────────────────────────────────┤
│  Inbound     │          Inventory                │
│  入库单       │  sku, name, qty, volume, value   │
│  supplier    │  warehouseId, category, inbound   │
│  batchNo     │  isAgeWarning, autoCreated        │
├──────────────┴──────────────────────────────────┤
│                 Transfer Order                   │
│  fromWarehouse → toWarehouse, sku, status        │
├─────────────────────────────────────────────────┤
│  Transit Order  (在途)                           │
│  trackingNo, transportMode, carrier, ETA         │
│  └─ StatusHistory[]                             │
├─────────────────────────────────────────────────┤
│  Outbound                                        │
│  出库单, customer, orderNo, destination          │
└─────────────────────────────────────────────────┘
```

---

## 二、核心表结构 (SQLite)

### 1. warehouses — 仓库
| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | UUID |
| `name` | TEXT | 仓库名称 |
| `country` | TEXT | 国家 |
| `city` | TEXT | 城市 |
| `totalVolume` | REAL | 总容量 (m³) |
| `usedVolume` | REAL | 已用容量 |
| `totalItems` | INTEGER | 总库位数 |
| `usedItems` | INTEGER | 已用库位 |
| `status` | TEXT | normal / maintenance / full |
| `address` | TEXT | 详细地址 |
| `manager` | TEXT | 负责人 |
| `phone` | TEXT | 联系电话 |

### 2. inventory_items — 库存明细
| 列 | 类型 | 说明 |
|----|------|------|
| `id` | TEXT PK | UUID |
| `sku` | TEXT | SKU 编码 |
| `name` | TEXT | 商品名称 |
| `warehouseId` | TEXT FK | 所属仓库 |
| `quantity` | INTEGER | 数量 |
| `volumePerUnit` | REAL | 单件体积 (m³) |
| `totalVolume` | REAL | 总体积 |
| `inboundDate` | TEXT | 入库日期 |
| `valuePerUnit` | REAL | 单价 |
| `totalValue` | REAL | 总价值 |
| `category` | TEXT | 品类 |
| `isAgeWarning` | INTEGER | 库龄预警 (0/1) |
| `autoCreated` | INTEGER | 是否入库自动创建 (0/1) |

### 3. inbound_records — 入库记录
| 列 | 类型 | 说明 |
|----|------|------|
| `warehouseId` | TEXT FK | 目标仓库 |
| `sku` / `name` | TEXT | SKU 信息 |
| `quantity` / `volume` | NUMBER | 数量/体积 |
| `supplier` | TEXT | 供应商名称 |
| `supplier_id` | TEXT FK | 供应商 ID (partner) |
| `batchNo` | TEXT | 批次号 |
| `operator` / `status` | TEXT | 操作人/状态 |

### 4. outbound_records — 出库记录
| 列 | 类型 | 说明 |
|----|------|------|
| `warehouseId` | TEXT FK | 来源仓库 |
| `destination` | TEXT | 目的地 |
| `customer` | TEXT | 客户名称 |
| `customer_id` | TEXT FK | 客户 ID (partner) |
| `orderNo` | TEXT | 订单号 |

### 5. transfer_orders — 调拨单 (v1.5.0)
| 列 | 类型 | 说明 |
|----|------|------|
| `transferNo` | TEXT | 调拨单号 |
| `fromWarehouseId` / `toWarehouseId` | TEXT FK | 来源/目标仓库 |
| `sku` / `name` / `quantity` / `volume` | — | SKU 调拨信息 |
| `status` | TEXT | draft → submitted → in_transit → completed |
| `transitOrderId` | TEXT FK | 关联在途单 |
| `submittedAt` / `receivedAt` / `completedAt` | TEXT | 操作时间线 |

### 6. transit_orders — 在途订单
| 列 | 类型 | 说明 |
|----|------|------|
| `trackingNo` | TEXT | 物流单号 |
| `transportMode` | TEXT | sea / air / land / rail |
| `carrier` | TEXT | 承运商 |
| `estimatedArrival` | TEXT | 预计到达 |
| `actualArrival` | TEXT | 实际到达 |

### 7. transit_status_history — 在途状态历史
| 列 | 类型 | 说明 |
|----|------|------|
| `transitOrderId` | TEXT FK | 关联在途单 |
| `status` | TEXT | dispatched / in_transit / customs / arrived |
| `time` / `location` / `remark` | TEXT | 时间/地点/备注 |

### 8. inventory_transactions — 库存流水
| 列 | 类型 | 说明 |
|----|------|------|
| `sku` | TEXT | SKU |
| `type` | TEXT | inbound / outbound / adjustment |
| `quantity` | INTEGER | 数量变化（正=入库，负=出库） |
| `sourceType` | TEXT | inbound_record / outbound_record / manual_adjustment |
| `sourceId` | TEXT FK | 来源单据 ID |

### 9. partners — 供应商/客户 (v1.4.0)
| 列 | 类型 | 说明 |
|----|------|------|
| `type` | TEXT | supplier / customer |
| `name` / `contact` / `phone` / `address` | TEXT | 基本信息 |
| `remark` | TEXT | 备注 |

---

## 三、业务状态机

### Transfer Order (调拨单)
```
  draft ──submit──▶ submitted ──pickup──▶ in_transit ──receive──▶ completed
```

### Transit Order (在途)
```
  dispatched → in_transit → customs_clearance → arrived
```

### Warehouse Status
```
  normal ⇄ maintenance | full
```

---

## 四、数据存储路径

| 类型 | 路径 |
|------|------|
| SQLite DB | `~/.cdf-know-clow/chat.db` |
| DB 备份 | `~/.cdf-know-clow/chat.db.bak` |
| WAL 日志 | `~/.cdf-know-clow/chat.db-wal` |
| 技能文件 | `~/.cdf-know-clow/skills/` |
| 密钥存储 | macOS Keychain |
