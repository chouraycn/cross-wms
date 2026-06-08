# CDF Know Clow MSW Mock API 使用指南

## 概述

MSW (Mock Service Worker) 已集成到 CDF Know Clow 项目中，用于模拟后端 API 接口。基于 API 接口规范 v1.0 实现。

## 文件结构

```
src/mocks/
├── index.ts          # 主入口，根据环境变量决定是否启用
├── browser.ts        # Browser 环境 worker 设置
├── factories.ts      # Mock 数据工厂（生成各类模拟数据）
└── handlers/
    └── index.ts      # API handlers（按模块组织）
```

## 启用 Mock

### 方式一：环境变量（推荐）

在 `.env.development` 中设置：

```bash
VITE_ENABLE_MOCK=true
```

然后重启 dev server：

```bash
npm run dev
```

### 方式二：浏览器控制台

在浏览器控制台中手动启动：

```javascript
window.msw.start()
```

## API 模块

### 1. 仓库管理 (`/api/v1/warehouses`)
- `GET /api/v1/warehouses` - 获取仓库列表（支持分页、关键词、状态筛选）
- `GET /api/v1/warehouses/:id` - 获取单个仓库详情
- `POST /api/v1/warehouses` - 新建仓库
- `PUT /api/v1/warehouses/:id` - 更新仓库
- `DELETE /api/v1/warehouses/:id` - 删除仓库

### 2. 在途运单 (`/api/v1/transit`)
- `GET /api/v1/transit` - 获取运单列表（支持分页、状态、仓库筛选）
- `GET /api/v1/transit/:id` - 获取运单详情
- `POST /api/v1/transit` - 新建运单
- `PUT /api/v1/transit/:id/status` - 更新运单状态

### 3. 库存管理 (`/api/v1/inventory`)
- `GET /api/v1/inventory` - 获取库存列表（支持分页、仓库、品类、库龄预警筛选）
- `GET /api/v1/inventory/warehouse/:warehouseId` - 获取指定仓库库存

### 4. 入库/出库记录
- `GET /api/v1/inbound` - 获取入库记录
- `POST /api/v1/inbound` - 创建入库记录
- `GET /api/v1/outbound` - 获取出库记录
- `POST /api/v1/outbound` - 创建出库记录

### 5. 仪表盘数据 (`/api/v1/dashboard/*`)
- `GET /api/v1/dashboard/kpi` - KPI 数据
- `GET /api/v1/dashboard/volume-history?days=30` - 容积率趋势
- `GET /api/v1/dashboard/monthly-trend` - 月度趋势
- `GET /api/v1/dashboard/warehouse-volume` - 仓库容积分布
- `GET /api/v1/dashboard/category-volume` - 品类分布
- `GET /api/v1/dashboard/transit-efficiency` - 在途时效
- `GET /api/v1/dashboard/heatmap?days=14` - 热力图数据
- `GET /api/v1/dashboard/inventory-alerts` - 库存预警

## 数据工厂

`factories.ts` 提供了各类 Mock 数据生成函数：

```typescript
import {
  createMockWarehouse,
  createMockTransitOrder,
  createMockInventoryItem,
  // ...
} from '../mocks/factories';

// 创建单个 mock 数据
const warehouse = createMockWarehouse();

// 创建指定数量的 mock 数据
const warehouses = createMockWarehouses(5);
```

## 扩展 Mock API

如需添加新的 API 接口，在 `handlers/index.ts` 中添加：

```typescript
import { http, HttpResponse, delay } from 'msw';

export const myNewHandlers = [
  http.get('/api/v1/my-endpoint', async () => {
    await delay(200);
    return HttpResponse.json({ code: 0, message: 'success', data: {...} });
  }),
];

// 然后在 handlers 数组中添加
export const handlers = [
  ...warehouseHandlers,
  ...myNewHandlers, // 新增
];
```

## 注意事项

1. **Mock 仅在开发环境生效**：`VITE_ENABLE_MOCK` 仅在 `import.meta.env.DEV` 为 true 时检查
2. **Service Worker 文件**：`mockServiceWorker.js` 已生成在 `public/` 目录，不要删除
3. **网络延迟模拟**：handlers 中使用 `delay(ms)` 模拟网络延迟
4. **数据持久性**：Mock 数据存储在内存中，页面刷新后会重置

## 切换真实 API

当后端 API 就绪后：

1. 设置 `VITE_ENABLE_MOCK=false`（或删除该环境变量）
2. 确保 `VITE_API_BASE_URL` 指向真实后端地址
3. 在前端 API 调用层使用环境变量配置 baseURL

## 调试

打开浏览器 DevTools → Network 面板，可以看到被 MSW 拦截的请求，状态码为 `(mocked)`。

在 Console 中可以看到 `[MSW] Mock API 已启动` 的日志。
