/**
 * 调拨单 API 封装
 *
 * 封装后端调拨单相关的 9 个 API 调用：
 * - GET    /api/transfer-orders           查询列表
 * - GET    /api/transfer-orders/:id       查询详情
 * - POST   /api/transfer-orders           创建（支持 autoSubmit）
 * - PUT    /api/transfer-orders/:id       更新草稿
 * - DELETE /api/transfer-orders/:id       删除草稿
 * - POST   /api/transfer-orders/:id/submit     提交
 * - POST   /api/transfer-orders/:id/receive    确认收货
 * - PUT    /api/transfer-orders/:id/bind-transit   绑定物流
 * - PUT    /api/transfer-orders/:id/unbind-transit 解绑物流
 */

import type { TransferOrder, TransferOrderFilter, TransferStats } from '../types/wms';

const BASE_URL = '/api/transfer-orders';

// ===================== 通用响应格式 =====================

interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 统一处理 API 响应 */
async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();
  if (json.code === 0 && json.data !== undefined && json.data !== null) {
    return json.data;
  }
  throw new Error(json.message || '操作失败');
}

// ===================== API 方法 =====================

/**
 * 查询调拨单列表
 * GET /api/transfer-orders?status=draft&fromWarehouseId=xxx&toWarehouseId=xxx&sku=ABC&page=1&pageSize=20
 */
export async function fetchTransferOrders(filter?: TransferOrderFilter & { page?: number; pageSize?: number }): Promise<PaginatedData<TransferOrder>> {
  try {
    const params = new URLSearchParams();
    if (filter?.status) params.append('status', filter.status);
    if (filter?.fromWarehouseId) params.append('fromWarehouseId', filter.fromWarehouseId);
    if (filter?.toWarehouseId) params.append('toWarehouseId', filter.toWarehouseId);
    if (filter?.sku) params.append('sku', filter.sku);
    if (filter?.page) params.append('page', String(filter.page));
    if (filter?.pageSize) params.append('pageSize', String(filter.pageSize));

    const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL;
    const resp = await fetch(url);
    return await handleResponse<PaginatedData<TransferOrder>>(resp);
  } catch (error) {
    console.warn('[TransferAPI] 获取调拨列表失败:', error);
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
}

/**
 * 查询单条调拨详情
 * GET /api/transfer-orders/:id
 */
export async function fetchTransferOrderById(id: string): Promise<TransferOrder | null> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}`);
    return await handleResponse<TransferOrder>(resp);
  } catch (error) {
    console.warn('[TransferAPI] 获取调拨详情失败:', error);
    return null;
  }
}

/**
 * 创建调拨单（支持 autoSubmit）
 * POST /api/transfer-orders
 */
export async function createTransferOrder(data: Partial<TransferOrder> & { autoSubmit?: boolean; submittedBy?: string }): Promise<TransferOrder> {
  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 更新调拨草稿
 * PUT /api/transfer-orders/:id
 */
export async function updateTransferOrder(id: string, data: Partial<TransferOrder>): Promise<TransferOrder> {
  const resp = await fetch(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 删除调拨草稿
 * DELETE /api/transfer-orders/:id
 */
export async function deleteTransferOrder(id: string): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
    const json = await resp.json();
    return json.code === 0;
  } catch (error) {
    console.error('[TransferAPI] 删除调拨单失败:', error);
    return false;
  }
}

/**
 * 提交调拨单（出库扣减）
 * POST /api/transfer-orders/:id/submit
 */
export async function submitTransferOrder(id: string, submittedBy: string): Promise<TransferOrder> {
  const resp = await fetch(`${BASE_URL}/${id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ submittedBy }),
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 确认收货
 * POST /api/transfer-orders/:id/receive
 */
export async function receiveTransferOrder(id: string, receivedBy: string): Promise<TransferOrder> {
  const resp = await fetch(`${BASE_URL}/${id}/receive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ receivedBy }),
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 绑定物流
 * PUT /api/transfer-orders/:id/bind-transit
 */
export async function bindTransitOrder(id: string, transitOrderId: string): Promise<TransferOrder> {
  const resp = await fetch(`${BASE_URL}/${id}/bind-transit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transitOrderId }),
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 解绑物流
 * PUT /api/transfer-orders/:id/unbind-transit
 */
export async function unbindTransitOrder(id: string): Promise<TransferOrder> {
  const resp = await fetch(`${BASE_URL}/${id}/unbind-transit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
  });
  return await handleResponse<TransferOrder>(resp);
}

/**
 * 从列表数据本地计算统计信息
 */
export function calculateTransferStats(items: TransferOrder[]): TransferStats {
  const stats: TransferStats = {
    total: items.length,
    draft: 0,
    submitted: 0,
    in_transit: 0,
    completed: 0,
  };

  items.forEach((item) => {
    switch (item.status) {
      case 'draft':
        stats.draft++;
        break;
      case 'submitted':
        stats.submitted++;
        break;
      case 'in_transit':
        stats.in_transit++;
        break;
      case 'completed':
        stats.completed++;
        break;
    }
  });

  return stats;
}
