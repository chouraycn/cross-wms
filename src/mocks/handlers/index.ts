/**
 * CrossWMS MSW Mock Handlers
 * 基于 API 接口规范 v1.0 实现
 */

import { http, HttpResponse, delay } from 'msw';
import {
  createMockWarehouse,
  createMockWarehouses,
  createMockTransitOrder,
  createMockTransitOrders,
  createMockInventoryItem,
  createMockInventoryItems,
  createMockInboundRecord,
  createMockInboundRecords,
  createMockOutboundRecord,
  createMockOutboundRecords,
  createMockKpiData,
  createMockVolumeHistory,
  createMockMonthlyTrend,
  createMockWarehouseVolumeData,
  createMockCategoryVolumeData,
  createMockTransitEfficiencyData,
} from '../factories';
import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  InboundRecord,
  OutboundRecord,
} from '../../types';

// ===================== 模拟数据库（内存） =====================

let warehouses: Warehouse[] = createMockWarehouses(5);
let transitOrders = createMockTransitOrders(20);
let inventoryItems = createMockInventoryItems(50);
let inboundRecords = createMockInboundRecords(30);
let outboundRecords = createMockOutboundRecords(30);

// ===================== 通用响应格式 =====================

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

function success<T>(data: T): ApiResponse<T> {
  return { code: 0, message: 'success', data, timestamp: Date.now() };
}

function error(code: number, message: string): ApiResponse<null> {
  return { code, message, data: null, timestamp: Date.now() };
}

// ===================== 仓库管理 API =====================

export const warehouseHandlers = [
  // GET /api/v1/warehouses - 获取仓库列表
  http.get('/api/v1/warehouses', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const keyword = url.searchParams.get('keyword') || '';
    const status = url.searchParams.get('status') || '';

    let filtered = warehouses;
    if (keyword) {
      filtered = filtered.filter(w => w.name.includes(keyword) || w.city.includes(keyword));
    }
    if (status) {
      filtered = filtered.filter(w => w.status === status);
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return HttpResponse.json(success({
      list: paginated,
      total: filtered.length,
      page,
      pageSize,
    }));
  }),

  // GET /api/v1/warehouses/:id - 获取单个仓库详情
  http.get('/api/v1/warehouses/:id', async ({ params }) => {
    await delay(150);
    const { id } = params;
    const warehouse = warehouses.find(w => w.id === id);
    if (!warehouse) {
      return HttpResponse.json(error(404, '仓库不存在'));
    }
    return HttpResponse.json(success(warehouse));
  }),

  // POST /api/v1/warehouses - 新建仓库
  http.post('/api/v1/warehouses', async ({ request }) => {
    await delay(300);
    const body = await request.json() as Partial<Warehouse>;
    const newWh = createMockWarehouse(body);
    warehouses.push(newWh);
    return HttpResponse.json(success(newWh));
  }),

  // PUT /api/v1/warehouses/:id - 更新仓库
  http.put('/api/v1/warehouses/:id', async ({ params, request }) => {
    await delay(200);
    const { id } = params;
    const body = await request.json() as Partial<Warehouse>;
    const idx = warehouses.findIndex(w => w.id === id);
    if (idx === -1) {
      return HttpResponse.json(error(404, '仓库不存在'));
    }
    warehouses[idx] = { ...warehouses[idx], ...body };
    return HttpResponse.json(success(warehouses[idx]));
  }),

  // DELETE /api/v1/warehouses/:id - 删除仓库
  http.delete('/api/v1/warehouses/:id', async ({ params }) => {
    await delay(200);
    const { id } = params;
    const idx = warehouses.findIndex(w => w.id === id);
    if (idx === -1) {
      return HttpResponse.json(error(404, '仓库不存在'));
    }
    warehouses.splice(idx, 1);
    return HttpResponse.json(success(null));
  }),
];

// ===================== 在途运单 API =====================

export const transitHandlers = [
  // GET /api/v1/transit - 获取运单列表
  http.get('/api/v1/transit', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const status = url.searchParams.get('status') || '';
    const warehouseId = url.searchParams.get('warehouseId') || '';

    let filtered = transitOrders;
    if (status) {
      filtered = filtered.filter(o => o.status === status);
    }
    if (warehouseId) {
      filtered = filtered.filter(o => o.toWarehouseId === warehouseId || o.fromWarehouseId === warehouseId);
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return HttpResponse.json(success({
      list: paginated,
      total: filtered.length,
      page,
      pageSize,
    }));
  }),

  // GET /api/v1/transit/:id - 获取运单详情
  http.get('/api/v1/transit/:id', async ({ params }) => {
    await delay(150);
    const { id } = params;
    const order = transitOrders.find(o => o.id === id);
    if (!order) {
      return HttpResponse.json(error(404, '运单不存在'));
    }
    return HttpResponse.json(success(order));
  }),

  // POST /api/v1/transit - 新建运单
  http.post('/api/v1/transit', async ({ request }) => {
    await delay(300);
    const body = await request.json() as Partial<TransitOrder>;
    const newOrder = createMockTransitOrder(body);
    transitOrders.push(newOrder);
    return HttpResponse.json(success(newOrder));
  }),

  // PUT /api/v1/transit/:id/status - 更新运单状态
  http.put('/api/v1/transit/:id/status', async ({ params, request }) => {
    await delay(200);
    const { id } = params;
    const body = await request.json() as { status: TransitOrder['status'] };
    const idx = transitOrders.findIndex(o => o.id === id);
    if (idx === -1) {
      return HttpResponse.json(error(404, '运单不存在'));
    }
    transitOrders[idx].status = body.status;
    transitOrders[idx].statusHistory.push({
      status: body.status,
      time: new Date().toISOString(),
      location: '更新地点',
      remark: '状态更新',
    });
    return HttpResponse.json(success(transitOrders[idx]));
  }),
];

// ===================== 库存管理 API =====================

export const inventoryHandlers = [
  // GET /api/v1/inventory - 获取库存列表
  http.get('/api/v1/inventory', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const warehouseId = url.searchParams.get('warehouseId') || '';
    const category = url.searchParams.get('category') || '';
    const ageWarning = url.searchParams.get('ageWarning') === 'true';

    let filtered = inventoryItems;
    if (warehouseId) {
      filtered = filtered.filter(i => i.warehouseId === warehouseId);
    }
    if (category) {
      filtered = filtered.filter(i => i.category === category);
    }
    if (ageWarning) {
      filtered = filtered.filter(i => i.isAgeWarning);
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return HttpResponse.json(success({
      list: paginated,
      total: filtered.length,
      page,
      pageSize,
    }));
  }),

  // GET /api/v1/inventory/warehouse/:warehouseId - 获取指定仓库库存
  http.get('/api/v1/inventory/warehouse/:warehouseId', async ({ params }) => {
    await delay(150);
    const { warehouseId } = params;
    const items = inventoryItems.filter(i => i.warehouseId === warehouseId);
    return HttpResponse.json(success(items));
  }),
];

// ===================== 入库/出库记录 API =====================

export const recordHandlers = [
  // GET /api/v1/inbound - 获取入库记录
  http.get('/api/v1/inbound', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const warehouseId = url.searchParams.get('warehouseId') || '';

    let filtered = inboundRecords;
    if (warehouseId) {
      filtered = filtered.filter(r => r.warehouseId === warehouseId);
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return HttpResponse.json(success({
      list: paginated,
      total: filtered.length,
      page,
      pageSize,
    }));
  }),

  // POST /api/v1/inbound - 创建入库记录
  http.post('/api/v1/inbound', async ({ request }) => {
    await delay(300);
    const body = await request.json() as Partial<InboundRecord>;
    const newRecord = createMockInboundRecord(body);
    inboundRecords.push(newRecord);
    return HttpResponse.json(success(newRecord));
  }),

  // GET /api/v1/outbound - 获取出库记录
  http.get('/api/v1/outbound', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '10');
    const warehouseId = url.searchParams.get('warehouseId') || '';

    let filtered = outboundRecords;
    if (warehouseId) {
      filtered = filtered.filter(r => r.warehouseId === warehouseId);
    }

    const start = (page - 1) * pageSize;
    const paginated = filtered.slice(start, start + pageSize);

    return HttpResponse.json(success({
      list: filtered,
      total: filtered.length,
      page,
      pageSize,
    }));
  }),

  // POST /api/v1/outbound - 创建出库记录
  http.post('/api/v1/outbound', async ({ request }) => {
    await delay(300);
    const body = await request.json() as Partial<OutboundRecord>;
    const newRecord = createMockOutboundRecord(body);
    outboundRecords.push(newRecord);
    return HttpResponse.json(success(newRecord));
  }),
];

// ===================== 仪表盘数据 API =====================

export const dashboardHandlers = [
  // GET /api/v1/dashboard/kpi - KPI 数据
  http.get('/api/v1/dashboard/kpi', async () => {
    await delay(200);
    return HttpResponse.json(success(createMockKpiData()));
  }),

  // GET /api/v1/dashboard/volume-history - 容积率趋势
  http.get('/api/v1/dashboard/volume-history', async ({ request }) => {
    await delay(200);
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');
    return HttpResponse.json(success(createMockVolumeHistory(days)));
  }),

  // GET /api/v1/dashboard/monthly-trend - 月度趋势
  http.get('/api/v1/dashboard/monthly-trend', async () => {
    await delay(200);
    return HttpResponse.json(success(createMockMonthlyTrend()));
  }),

  // GET /api/v1/dashboard/warehouse-volume - 仓库容积分布
  http.get('/api/v1/dashboard/warehouse-volume', async () => {
    await delay(200);
    return HttpResponse.json(success(createMockWarehouseVolumeData(warehouses)));
  }),

  // GET /api/v1/dashboard/category-volume - 品类分布
  http.get('/api/v1/dashboard/category-volume', async () => {
    await delay(200);
    return HttpResponse.json(success(createMockCategoryVolumeData()));
  }),

  // GET /api/v1/dashboard/transit-efficiency - 在途时效
  http.get('/api/v1/dashboard/transit-efficiency', async () => {
    await delay(200);
    return HttpResponse.json(success(createMockTransitEfficiencyData()));
  }),

  // GET /api/v1/dashboard/heatmap - 热力图数据
  http.get('/api/v1/dashboard/heatmap', async ({ request }) => {
    await delay(300);
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '14');
    const data: Array<{ date: string; warehouseId: string; warehouseName: string; volume: number }> = [];

    const baseDate = new Date();
    for (let i = days; i >= 0; i--) {
      const date = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      warehouses.forEach(wh => {
        data.push({
          date,
          warehouseId: wh.id,
          warehouseName: wh.name,
          volume: Math.floor(Math.random() * 500) + 50,
        });
      });
    }

    return HttpResponse.json(success(data));
  }),

  // GET /api/v1/dashboard/inventory-alerts - 库存预警
  http.get('/api/v1/dashboard/inventory-alerts', async () => {
    await delay(200);
    const alerts = inventoryItems.filter(i => i.isAgeWarning).slice(0, 10);
    return HttpResponse.json(success(alerts));
  }),
];

// ===================== 导出所有 handlers =====================

export const handlers = [
  ...warehouseHandlers,
  ...transitHandlers,
  ...inventoryHandlers,
  ...recordHandlers,
  ...dashboardHandlers,
];
