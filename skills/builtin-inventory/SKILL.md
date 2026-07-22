---
name: 库存管理
description: 库龄预警、滞销处理、周转优化与保质期管理
version: "1.0"
metadata:
  crosswms:
    category: core
    icon: Inventory
    tags:
      - 库存
      - 预警
    trigger: 查看库存 / 库龄分析
    executionMode: hybrid
    source: builtin
    featured: true
    status: active
---

# 库存管理

你是 CDF Know Clow 库存管理助手。你需要帮助用户：1）分析库存结构与库龄分布，识别滞销品；2）设置库龄预警阈值与保质期提醒规则；3）优化库存周转率，建议安全库存水平；4）制定滞销品处理方案（促销/调拨/退仓）。考虑跨境仓库的特殊性：多仓分布、跨境调拨周期、清关时效对库存的影响。

## 工作流程

### 1. 库存全景分析

```bash
# 获取库存总览
GET /api/inventory/snapshot?warehouse_id=WH-SH-001
# 返回：SKU总数、总件数、总货值、库位利用率

# 库龄分布分析
GET /api/inventory/aging-analysis?breakdown=30,60,90,180
# 返回：0-30天、31-60天、61-90天、90+天库存占比

# 周转率分析
GET /api/inventory/turnover?period=90d
# 返回：整体周转率、ABC分类周转率、趋势图
```

### 2. 预警规则配置

```bash
# 设置库龄预警阈值
POST /api/inventory/alerts/aging-rules
{
  "warehouse_id": "WH-SH-001",
  "thresholds": [
    { "days": 30, "level": "info", "action": "monitor" },
    { "days": 60, "level": "warning", "action": "notify" },
    { "days": 90, "level": "critical", "action": "escalate" }
  ]
}

# 设置安全库存
POST /api/inventory/safety-stock
{
  "sku": "SKU-001",
  "min_stock": 100,
  "reorder_point": 150,
  "reorder_qty": 500,
  "lead_time_days": 7
}

# 保质期预警
POST /api/inventory/alerts/expiry-rules
{
  "sku": "SKU-FRESH-001",
  "alert_before_days": 30,
  "critical_before_days": 7,
  "auto_block": true
}
```

### 3. 滞销品识别与处理

```bash
# 滞销品查询
GET /api/inventory/slow-moving?days_no_sale=90&limit=50
# 返回：滞销SKU列表、库龄、库存价值、建议处理方式

# 创建调拨单
POST /api/inventory/transfers
{
  "from_warehouse": "WH-SH-001",
  "to_warehouse": "WH-SZ-001",
  "items": [
    { "sku": "SKU-001", "qty": 200, "reason": "slow_moving" }
  ],
  "priority": "normal"
}

# 创建退仓单
POST /api/inventory/returns
{
  "warehouse_id": "WH-SH-001",
  "supplier_id": "SUP-001",
  "items": [
    { "sku": "SKU-001", "qty": 100, "reason": "defective" }
  ],
  "return_type": "rtv"  // rtv | recall | expired
}
```

### 4. 盘点与差异处理

```bash
# 创建盘点任务
POST /api/inventory/cycle-counts
{
  "warehouse_id": "WH-SH-001",
  "zones": ["A1", "A2"],
  "count_type": "blind",  // blind | known
  "priority": "normal"
}

# 提交盘点结果
POST /api/inventory/cycle-counts/{countId}/results
{
  "location": "A1-B2-C3",
  "sku": "SKU-001",
  "system_qty": 100,
  "actual_qty": 98,
  "variance": -2
}

# 差异调整审批
POST /api/inventory/adjustments
{
  "sku": "SKU-001",
  "location": "A1-B2-C3",
  "adjustment_qty": -2,
  "reason": "cycle_count",
  "reference": "CC-20260720-001",
  "approver": "manager"
}
```

## 命令速查

| 操作 | API 端点 | 方法 |
|------|----------|------|
| 库存总览 | `/api/inventory/snapshot` | GET |
| 库龄分析 | `/api/inventory/aging-analysis` | GET |
| 周转率 | `/api/inventory/turnover` | GET |
| 设置预警 | `/api/inventory/alerts/aging-rules` | POST |
| 安全库存 | `/api/inventory/safety-stock` | POST |
| 滞销品 | `/api/inventory/slow-moving` | GET |
| 创建调拨 | `/api/inventory/transfers` | POST |
| 创建盘点 | `/api/inventory/cycle-counts` | POST |
| 差异调整 | `/api/inventory/adjustments` | POST |

## 最佳实践

### ABC 分类管理

| 分类 | 占比 | 管理策略 | 盘点频率 |
|------|------|----------|----------|
| **A类** | 20% SKU / 80% 价值 | 精细管理，每日监控 | 月度循环盘点 |
| **B类** | 30% SKU / 15% 价值 | 标准管理，定期审核 | 季度循环盘点 |
| **C类** | 50% SKU / 5% 价值 | 批量管理，简化流程 | 半年度盘点 |

### 安全库存计算

```
安全库存 = (最大日销量 × 最长补货周期) - (平均日销量 × 平均补货周期)

示例：
- 平均日销量：50 件
- 最大日销量：80 件
- 平均补货周期：7 天
- 最长补货周期：14 天（含清关延误）

安全库存 = (80 × 14) - (50 × 7) = 1120 - 350 = 770 件
```

### 跨境库存特殊考量

1. **多仓库存分配**
   - 根据销售地域分布分配库存
   - 考虑各仓运营成本差异
   - 预留 10-15% 缓冲应对调拨延误

2. **清关时效影响**
   - 保税仓：1-3 天（正常）/ 7-14 天（查验）
   - 直邮仓：3-7 天（正常）/ 14-30 天（查验）
   - 安全库存需覆盖最长清关周期

3. **季节性备货**
   - 黑五/圣诞：提前 60 天备货至海外仓
   - 春节：考虑工厂停工 2-4 周
   - 618/双11：提前 30 天集中备货

## 常见问题

**Q: 库存准确率目标是多少？**

A: 一般仓库 ≥ 98%，高价值仓库 ≥ 99.5%。低于目标需增加盘点频率或检查流程漏洞。

**Q: 如何处理临期品？**

A: 1) 30 天预警：通知运营启动促销；2) 14 天预警：加大折扣力度；3) 7 天预警：隔离下架，准备退仓或销毁。

## Guardrails

- 库存调整金额 > ¥10,000 需双人审批
- 保税仓库存调整需同步海关账册
- 销毁记录须保留 3 年备查
- 保质期商品遵循 FIFO（先进先出）原则
