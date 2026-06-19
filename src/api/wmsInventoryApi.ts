/**
 * 库存盘点 API 封装
 *
 * 封装后端库存盘点相关的 5 个 API 调用：
 * - POST   /api/wms/inventory-count          创建盘点单
 * - GET    /api/wms/inventory-count          查询盘点列表
 * - GET    /api/wms/inventory-count/:id      查询单条详情
 * - PUT    /api/wms/inventory-count/:id      更新盘点记录
 * - POST   /api/wms/inventory-count/adjust   执行差异调整
 */

import type { InventoryCount, InventoryCountFilter, InventoryStats } from '../types/wms';

const BASE_URL = '/api/wms/inventory-count';

// ===================== 通用响应格式 =====================

interface ApiResponse<T> {
  code: number;
  data: T;
  message?: string;
}

/** 统一处理 API 响应 */
async function handleResponse<T>(response: Response): Promise<T> {
  const json: ApiResponse<T> = await response.json();
  if (json.code === 0 && json.data) {
    return json.data;
  }
  throw new Error(json.message || '操作失败');
}

// ===================== API 方法 =====================

/**
 * 查询盘点列表
 * GET /api/wms/inventory-count?warehouseId=xxx&status=xxx
 */
export async function fetchInventoryCounts(filter?: InventoryCountFilter): Promise<InventoryCount[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.warehouseId) params.append('warehouseId', filter.warehouseId);
    if (filter?.status) params.append('status', filter.status);
    if (filter?.sku) params.append('sku', filter.sku);
    if (filter?.locationCode) params.append('locationCode', filter.locationCode);

    const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL;
    const resp = await fetch(url);
    return await handleResponse<InventoryCount[]>(resp);
  } catch (error) {
    // console.warn('[InventoryAPI] 获取盘点列表失败:', error);
    return [];
  }
}

/**
 * 查询单条盘点详情
 * GET /api/wms/inventory-count/:id
 */
export async function fetchInventoryCountById(id: number): Promise<InventoryCount | null> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}`);
    return await handleResponse<InventoryCount>(resp);
  } catch (error) {
    // console.warn('[InventoryAPI] 获取盘点详情失败:', error);
    return null;
  }
}

/**
 * 创建盘点单（支持单条或批量）
 * POST /api/wms/inventory-count
 */
export async function createInventoryCount(data: InventoryCount | InventoryCount[]): Promise<InventoryCount | InventoryCount[]> {
  const resp = await fetch(BASE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await handleResponse<InventoryCount | InventoryCount[]>(resp);
}

/**
 * 更新盘点记录（录入实盘数量）
 * PUT /api/wms/inventory-count/:id
 */
export async function updateInventoryCount(id: number, data: Partial<InventoryCount>): Promise<InventoryCount> {
  const resp = await fetch(`${BASE_URL}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return await handleResponse<InventoryCount>(resp);
}

/**
 * 执行差异调整（确认盘点）
 * POST /api/wms/inventory-count/adjust
 */
export async function adjustInventoryCount(id: number, adjustBy: string): Promise<{ success: boolean; message: string }> {
  try {
    const resp = await fetch(`${BASE_URL}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, adjustBy }),
    });
    const json = await resp.json();
    if (json.code === 0) {
      return { success: true, message: json.message || '调整成功' };
    }
    return { success: false, message: json.message || '调整失败' };
  } catch (error) {
    // console.error('[InventoryAPI] 差异调整失败:', error);
    return { success: false, message: error instanceof Error ? error.message : '网络错误' };
  }
}

/**
 * 删除盘点记录
 * DELETE /api/wms/inventory-count/:id
 */
export async function deleteInventoryCount(id: number): Promise<boolean> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}`, { method: 'DELETE' });
    const json = await resp.json();
    return json.code === 0;
  } catch (error) {
    // console.error('[InventoryAPI] 删除盘点记录失败:', error);
    return false;
  }
}

/**
 * 获取盘点统计数据
 * 从列表数据本地计算统计信息
 */
export function calculateInventoryStats(data: InventoryCount[]): InventoryStats {
  const stats: InventoryStats = {
    total: data.length,
    pending: 0,
    counted: 0,
    adjusted: 0,
    totalVariance: 0,
  };

  data.forEach((item) => {
    switch (item.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'counted':
        stats.counted++;
        break;
      case 'adjusted':
        stats.adjusted++;
        break;
    }
    // 累加已调整的差异
    if (item.status === 'adjusted' && item.variance) {
      stats.totalVariance += item.variance;
    }
  });

  return stats;
}
