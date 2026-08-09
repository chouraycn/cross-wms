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

> 端点契约以 `server/routes/warehouses.ts` 与 `server/routes/transfer.ts` 实际实现为准。
> 标注「规划中」的能力当前后端尚未开放 API，请勿在调用中假设其存在。

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

# 查询仓库列表（可按 type 过滤）
GET /api/warehouses?type=bonded

# 查询单个仓库
GET /api/warehouses/{warehouseId}

# 更新仓库
PUT /api/warehouses/{warehouseId}

# 删除仓库
DELETE /api/warehouses/{warehouseId}
```

> 规划中：仓库级配置（`PUT /api/warehouses/{id}/settings`，如运营时间、时区、币种、海关监管代码）当前后端未实现，待后续版本开放。

### 2. 库位规划与管理（规划中）

库区（zones）/ 库位（locations）的创建与利用率查询端点（`POST /api/warehouses/{id}/zones`、`POST /api/warehouses/{id}/locations`、`GET /api/warehouses/{id}/locations/utilization`）当前后端尚未实现。可先基于仓库 `capacity` 字段做容量规划建议，待 API 开放后再接入精细化库位管理。

### 3. 仓库容量分析（规划中）

实时容量（`GET /api/warehouses/{id}/capacity/realtime`）、容量预测（`/capacity/forecast`）与件数统计（`/statistics`）端点当前后端尚未实现。可基于仓库 `capacity.total_pallet` 等静态字段给出粗略容积率评估，实时数据待 API 开放。

### 4. 多仓调拨管理（已支持，端点为 /api/transfer-orders）

```bash
# 查询调拨单列表（支持 status / fromWarehouseId / toWarehouseId / sku / 分页）
GET /api/transfer-orders?status=draft&page=1&pageSize=20

# 查询调拨单详情（响应含 fromWarehouseName / toWarehouseName / transitTrackingNo）
GET /api/transfer-orders/{transferId}

# 创建调拨单（支持 autoSubmit 自动提交出库扣减）
POST /api/transfer-orders
{
  "fromWarehouse": "WH-SH-001",
  "toWarehouse": "WH-SZ-001",
  "items": [
    { "sku": "SKU-001", "qty": 500, "reason": "stock_balancing" }
  ],
  "transportMode": "truck",  // truck | rail | air | sea
  "expectedArrival": "2026-07-25T10:00:00Z",
  "priority": "normal"
}

# 更新草稿
PUT /api/transfer-orders/{transferId}

# 删除草稿
DELETE /api/transfer-orders/{transferId}

# 提交（出库扣减）
POST /api/transfer-orders/{transferId}/submit

# 确认收货
POST /api/transfer-orders/{transferId}/receive

# 绑定 / 解绑物流单
PUT /api/transfer-orders/{transferId}/bind-transit
PUT /api/transfer-orders/{transferId}/unbind-transit
```

> 调拨跟踪：详情接口直接返回 `transitTrackingNo`，无需单独调用 tracking 端点。
> 规划中：跨仓可调配库存查询（`GET /api/warehouses/{id}/transferable-stock`）尚未实现。

## 命令速查

| 操作 | API 端点 | 方法 | 状态 |
|------|----------|------|------|
| 创建仓库 | `/api/warehouses` | POST | ✅ |
| 仓库列表 | `/api/warehouses` | GET | ✅ |
| 查询仓库 | `/api/warehouses/{id}` | GET | ✅ |
| 更新仓库 | `/api/warehouses/{id}` | PUT | ✅ |
| 删除仓库 | `/api/warehouses/{id}` | DELETE | ✅ |
| 仓库配置 | `/api/warehouses/{id}/settings` | PUT | 🚧 规划中 |
| 创建库区 | `/api/warehouses/{id}/zones` | POST | 🚧 规划中 |
| 创建库位 | `/api/warehouses/{id}/locations` | POST | 🚧 规划中 |
| 容量查询 | `/api/warehouses/{id}/capacity/realtime` | GET | 🚧 规划中 |
| 容量预测 | `/api/warehouses/{id}/capacity/forecast` | GET | 🚧 规划中 |
| 创建调拨 | `/api/transfer-orders` | POST | ✅ |
| 调拨列表 | `/api/transfer-orders` | GET | ✅ |
| 调拨详情/跟踪 | `/api/transfer-orders/{id}` | GET | ✅ |
| 调拨提交 | `/api/transfer-orders/{id}/submit` | POST | ✅ |
| 调拨收货 | `/api/transfer-orders/{id}/receive` | POST | ✅ |

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
```

特殊标识：
- F：地面堆叠（Floor）
- R：货架（Rack）
- C：笼车（Cage）

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
