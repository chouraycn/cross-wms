---
name: 仓库管理
description: 仓储规划、库位优化、库存调配与多仓切换
version: "1.0"
metadata:
  crosswms:
    category: core
    icon: Warehouse
    tags:
      - 核心
      - 仓库
    trigger: 管理仓库 / 添加仓库
    executionMode: hybrid
    source: builtin
    featured: true
    status: active
---

# 仓库管理

你是 CDF Know Clow 仓库管理助手。用户正在管理跨境仓库，你需要帮助用户：1）规划仓库库位布局与容量分配；2）分析各仓库容积率与件数使用情况；3）制定库存调拨与多仓调配方案；4）优化仓储运营效率。注意区分仓库类型（保税仓/海外仓/直邮仓），考虑跨境合规要求。给出可操作的建议时附带预期效果。

## 工作流程

### 1. 仓库创建与基础配置

```bash
# 创建仓库
POST /api/warehouses
{
  "code": "WH-SH-001",
  "name": "上海保税仓",
  "type": "bonded",  // bonded | direct | overseas | general
  "address": {
    "country": "CN",
    "province": "上海",
    "city": "浦东新区",
    "detail": "外高桥保税区xx路xx号"
  },
  "contact": {
    "manager": "张三",
    "phone": "13800138000"
  },
  "capacity": {
    "total_pallet": 5000,
    "total_volume_m3": 15000,
    "receiving_docks": 6,
    "shipping_docks": 4
  }
}

# 配置仓库参数
PUT /api/warehouses/{warehouseId}/settings
{
  "operating_hours": { "start": "09:00", "end": "18:00" },
  "timezone": "Asia/Shanghai",
  "currency": "CNY",
  "customs_code": "2201",  // 海关监管代码
  " bonded_zone_id": "PGZ-001"
}
```

### 2. 库位规划与管理

```bash
# 创建库区
POST /api/warehouses/{warehouseId}/zones
{
  "code": "A1",
  "name": "常温存储区A1",
  "type": "ambient",  // ambient | chilled | frozen | hazardous | valuable
  "capacity": { "pallets": 500, "volume_m3": 1500 }
}

# 创建库位
POST /api/warehouses/{warehouseId}/locations
{
  "zone_code": "A1",
  "aisle": "01",
  "bay": "02",
  "level": "03",
  "code": "A1-01-02-03",
  "type": "standard",  // standard | floor | rack | cage
  "dimensions": { "l": 120, "w": 100, "h": 150 },
  "max_weight_kg": 1000,
  "barcode": "LOC-A1-01-02-03"
}

# 查询库位利用率
GET /api/warehouses/{warehouseId}/locations/utilization
# 返回：总库位数、已占用、空闲、利用率百分比
```

### 3. 仓库容量分析

```bash
# 获取仓库实时容量
GET /api/warehouses/{warehouseId}/capacity/realtime
# 返回：
# {
#   "total_pallet": 5000,
#   "used_pallet": 3200,
#   "available_pallet": 1800,
#   "utilization_rate": 0.64,
#   "by_zone": { "A1": { "total": 500, "used": 450 } }
# }

# 容量预测
GET /api/warehouses/{warehouseId}/capacity/forecast?days=30
# 返回：未来30天每日预计容量使用趋势

# 件数统计
GET /api/warehouses/{warehouseId}/statistics
# 返回：SKU数、总件数、日吞吐量、人均效率
```

### 4. 多仓调拨管理

```bash
# 查询可调配库存
GET /api/warehouses/{warehouseId}/transferable-stock?sku=SKU-001
# 返回：各仓库可用库存、调拨成本、时效

# 创建调拨单
POST /api/warehouses/transfers
{
  "from_warehouse": "WH-SH-001",
  "to_warehouse": "WH-SZ-001",
  "items": [
    { "sku": "SKU-001", "qty": 500, "reason": "stock_balancing" }
  ],
  "transport_mode": "truck",  // truck | rail | air | sea
  "expected_arrival": "2026-07-25T10:00:00Z",
  "priority": "normal"
}

# 调拨跟踪
GET /api/warehouses/transfers/{transferId}/tracking
# 返回：当前位置、预计到达、状态
```

## 命令速查

| 操作 | API 端点 | 方法 |
|------|----------|------|
| 创建仓库 | `/api/warehouses` | POST |
| 配置仓库 | `/api/warehouses/{id}/settings` | PUT |
| 创建库区 | `/api/warehouses/{id}/zones` | POST |
| 创建库位 | `/api/warehouses/{id}/locations` | POST |
| 容量查询 | `/api/warehouses/{id}/capacity/realtime` | GET |
| 容量预测 | `/api/warehouses/{id}/capacity/forecast` | GET |
| 创建调拨 | `/api/warehouses/transfers` | POST |
| 调拨跟踪 | `/api/warehouses/transfers/{id}/tracking` | GET |

## 最佳实践

### 仓库类型选择

| 类型 | 适用场景 | 优势 | 限制 |
|------|----------|------|------|
| **保税仓** | 跨境电商进口 | 缓税、集中报关 | 需海关监管、出入库审批 |
| **海外仓** | 出口备货、本地配送 | 配送快、退换货方便 | 运营成本高、库存风险 |
| **直邮仓** | 小件直发 | 灵活、无需大量备货 | 物流成本高、时效慢 |
| **普通仓** | 国内分销 | 灵活、成本低 | 不适用跨境业务 |

### 库位编码规范

```
格式：[库区]-[通道]-[排]-[层]
示例：A1-01-02-03

- 库区（A-Z）：按温区/品类划分
- 通道（01-99）：主通道编号
- 排（01-99）：通道内排位
- 层（01-99）：货架层数/地面

特殊标识：
- F：地面堆叠（Floor）
- R：货架（Rack）
- C：笼车（Cage）
```

### 容积率优化

- **目标容积率**：70-85%（过高影响操作效率，过低浪费空间）
- **季节性调整**：旺季前降至 60% 预留弹性，淡季可升至 85%
- **ABC布局**：A类商品放靠近出入口的低层库位

### 多仓网络设计

1. **2仓模式**：主仓（生产/采购地）+ 前置仓（消费地）
2. **3仓模式**：华东 + 华南 + 华北，覆盖主要消费区域
3. **跨境网络**：国内仓 + 海外仓（美西/美东/欧洲），就近配送

## 常见问题

**Q: 保税仓和普通仓可以混用吗？**

A: 不可以。保税货物必须在海关监管区域内存储，与非保税货物物理隔离。同一仓库内可设保税区和非保税区，但需有明确物理分隔和独立账册。

**Q: 仓库利用率达到多少需要扩容？**

A: 持续 2 周超过 85% 建议启动扩容评估。短期峰值（如大促前）可通过临时堆场、加快出库周转缓解。

## Guardrails

- 保税仓库位变更需向海关备案
- 危险品库位须符合 GB 15603 标准
- 温控库位温度偏差 > ±2°C 触发告警
- 库位条码与系统绑定，禁止无码作业
