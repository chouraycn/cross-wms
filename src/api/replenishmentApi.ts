/**
 * 补货建议 API 封装
 *
 * 封装后端补货建议相关的 6 个 API 调用：
 * - GET    /api/wms/replenishment              查询建议列表（分页+筛选）
 * - POST   /api/wms/replenishment/generate     手动触发建议生成
 * - PUT    /api/wms/replenishment/:id/status   更新建议状态
 * - POST   /api/wms/replenishment/:id/confirm  确认补货建议         ← v1.7.0 新增
 * - POST   /api/wms/replenishment/:id/transfer 从建议一键创建调拨单
 * - GET    /api/wms/replenishment/:id/sources   获取推荐来源仓库列表
 */

import type {
  ReplenishmentSuggestion,
  ReplenishmentConfig,
  ReplenishmentFilter,
  ReplenishmentStats,
  SourceRecommendation,
} from '../types/wms';

const BASE_URL = '/api/wms/replenishment';

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
  stats?: ReplenishmentStats;
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
 * 查询补货建议列表
 * GET /api/wms/replenishment?status=pending&priority=critical&warehouseId=xxx&sku=ABC&page=1&pageSize=20&includeStats=true
 */
export async function fetchReplenishmentSuggestions(
  filters?: ReplenishmentFilter & { includeStats?: boolean },
): Promise<PaginatedData<ReplenishmentSuggestion>> {
  try {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.warehouseId) params.append('warehouseId', filters.warehouseId);
    if (filters?.sku) params.append('sku', filters.sku);
    if (filters?.page) params.append('page', String(filters.page));
    if (filters?.pageSize) params.append('pageSize', String(filters.pageSize));
    if (filters?.includeStats) params.append('includeStats', 'true');

    const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL;
    const resp = await fetch(url);
    return await handleResponse<PaginatedData<ReplenishmentSuggestion>>(resp);
  } catch (error) {
    console.warn('[ReplenishmentAPI] 获取补货建议列表失败:', error);
    return { items: [], total: 0, page: 1, pageSize: 20 };
  }
}

/**
 * 手动触发补货建议生成
 * POST /api/wms/replenishment/generate
 */
export async function generateReplenishmentSuggestions(
  config?: Partial<ReplenishmentConfig>,
): Promise<{ created: number; suggestions: ReplenishmentSuggestion[] }> {
  try {
    const resp = await fetch(`${BASE_URL}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config ?? {}),
    });
    return await handleResponse<{ created: number; suggestions: ReplenishmentSuggestion[] }>(resp);
  } catch (error) {
    console.warn('[ReplenishmentAPI] 生成补货建议失败:', error);
    return { created: 0, suggestions: [] };
  }
}

/**
 * 更新建议状态
 * PUT /api/wms/replenishment/:id/status
 */
export async function updateSuggestionStatus(
  id: number,
  status: 'pending' | 'confirmed' | 'ignored' | 'deferred',
): Promise<ReplenishmentSuggestion | null> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    return await handleResponse<ReplenishmentSuggestion>(resp);
  } catch (error) {
    console.warn('[ReplenishmentAPI] 更新建议状态失败:', error);
    return null;
  }
}

/**
 * 从建议一键创建调拨单
 * POST /api/wms/replenishment/:id/transfer
 */
export async function createTransferFromSuggestion(
  id: number,
  data: { fromWarehouseId: string; quantity: number },
): Promise<{ suggestion: ReplenishmentSuggestion; transferOrderId: string } | null> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}/transfer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return await handleResponse<{ suggestion: ReplenishmentSuggestion; transferOrderId: string }>(resp);
  } catch (error) {
    console.warn('[ReplenishmentAPI] 创建调拨单失败:', error);
    return null;
  }
}

/**
 * 确认补货建议
 * POST /api/wms/replenishment/:id/confirm
 *
 * 将指定补货建议的状态标记为 confirmed。
 * 成功后返回更新后的建议对象。
 */
export async function confirmReplenishmentSuggestion(
  id: number,
): Promise<ReplenishmentSuggestion> {
  const resp = await fetch(`${BASE_URL}/${id}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  return await handleResponse<ReplenishmentSuggestion>(resp);
}

/**
 * 获取推荐来源仓库列表
 * GET /api/wms/replenishment/:id/sources
 */
export async function fetchSourceRecommendations(
  id: number,
): Promise<SourceRecommendation[]> {
  try {
    const resp = await fetch(`${BASE_URL}/${id}/sources`);
    return await handleResponse<SourceRecommendation[]>(resp);
  } catch (error) {
    console.warn('[ReplenishmentAPI] 获取来源仓库推荐失败:', error);
    return [];
  }
}
