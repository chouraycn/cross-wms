/**
 * 库存盘点 API 层单元测试
 *
 * 测试范围：
 * - calculateInventoryStats() 本地统计计算
 * - fetchInventoryCounts() URL 构造与参数处理
 * - fetchInventoryCountById() URL 构造
 * - createInventoryCount() 请求构造
 * - updateInventoryCount() 请求构造
 * - adjustInventoryCount() 请求构造与响应处理
 * - deleteInventoryCount() 请求构造与响应处理
 * - handleResponse 通用响应处理（成功/失败）
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchInventoryCounts,
  fetchInventoryCountById,
  createInventoryCount,
  updateInventoryCount,
  adjustInventoryCount,
  deleteInventoryCount,
  calculateInventoryStats,
} from '@/api/wmsInventoryApi';
import type { InventoryCount, InventoryCountFilter } from '@/types/wms';

// ===================== calculateInventoryStats (纯函数，无需 mock) =====================

describe('calculateInventoryStats', () => {
  it('should return zero stats for empty array', () => {
    const stats = calculateInventoryStats([]);
    expect(stats).toEqual({
      total: 0,
      pending: 0,
      counted: 0,
      adjusted: 0,
      totalVariance: 0,
    });
  });

  it('should count pending items correctly', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'pending' },
      { warehouseId: 'WH-001', locationCode: 'A-02', sku: 'SKU002', systemQuantity: 50, status: 'pending' },
    ];
    const stats = calculateInventoryStats(data);
    expect(stats.total).toBe(2);
    expect(stats.pending).toBe(2);
    expect(stats.counted).toBe(0);
    expect(stats.adjusted).toBe(0);
  });

  it('should count counted items correctly', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'counted', actualQuantity: 98 },
    ];
    const stats = calculateInventoryStats(data);
    expect(stats.counted).toBe(1);
    expect(stats.total).toBe(1);
  });

  it('should count adjusted items correctly and accumulate totalVariance', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, actualQuantity: 95, variance: -5, status: 'adjusted' },
      { warehouseId: 'WH-001', locationCode: 'A-02', sku: 'SKU002', systemQuantity: 50, actualQuantity: 55, variance: 5, status: 'adjusted' },
    ];
    const stats = calculateInventoryStats(data);
    expect(stats.adjusted).toBe(2);
    expect(stats.totalVariance).toBe(0); // -5 + 5 = 0
  });

  it('should only accumulate variance for adjusted items', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, actualQuantity: 90, variance: -10, status: 'counted' },
      { warehouseId: 'WH-001', locationCode: 'A-02', sku: 'SKU002', systemQuantity: 50, actualQuantity: 60, variance: 10, status: 'adjusted' },
    ];
    const stats = calculateInventoryStats(data);
    // counted 的 variance 不计入 totalVariance
    expect(stats.totalVariance).toBe(10);
  });

  it('should handle mixed status items', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'pending' },
      { warehouseId: 'WH-001', locationCode: 'A-02', sku: 'SKU002', systemQuantity: 50, actualQuantity: 48, status: 'counted' },
      { warehouseId: 'WH-001', locationCode: 'A-03', sku: 'SKU003', systemQuantity: 200, actualQuantity: 195, variance: -5, status: 'adjusted' },
    ];
    const stats = calculateInventoryStats(data);
    expect(stats.total).toBe(3);
    expect(stats.pending).toBe(1);
    expect(stats.counted).toBe(1);
    expect(stats.adjusted).toBe(1);
    expect(stats.totalVariance).toBe(-5);
  });

  it('should handle adjusted items without variance field', () => {
    const data: InventoryCount[] = [
      { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'adjusted' },
    ];
    const stats = calculateInventoryStats(data);
    expect(stats.adjusted).toBe(1);
    expect(stats.totalVariance).toBe(0);
  });
});

// ===================== API 函数测试（mock fetch） =====================

describe('API functions (mocked fetch)', () => {
  const mockFetch = vi.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    mockFetch.mockReset();
  });

  // ---------- fetchInventoryCounts ----------

  describe('fetchInventoryCounts', () => {
    it('should call GET /api/wms/inventory-count without params when no filter', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: [] }),
      });

      await fetchInventoryCounts();

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count');
    });

    it('should construct URL with filter parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: [] }),
      });

      const filter: InventoryCountFilter = {
        warehouseId: 'WH-001',
        status: 'pending',
        sku: 'SKU001',
        locationCode: 'A-01',
      };

      await fetchInventoryCounts(filter);

      const calledUrl = mockFetch.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/api/wms/inventory-count?');
      expect(calledUrl).toContain('warehouseId=WH-001');
      expect(calledUrl).toContain('status=pending');
      expect(calledUrl).toContain('sku=SKU001');
      expect(calledUrl).toContain('locationCode=A-01');
    });

    it('should return empty array on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: 'Server Error' }),
      });

      const result = await fetchInventoryCounts();
      expect(result).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      const result = await fetchInventoryCounts();
      expect(result).toEqual([]);
    });

    it('should return parsed data on successful response', async () => {
      const mockData: InventoryCount[] = [
        { warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'pending' },
      ];

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: mockData }),
      });

      const result = await fetchInventoryCounts();
      expect(result).toEqual(mockData);
    });
  });

  // ---------- fetchInventoryCountById ----------

  describe('fetchInventoryCountById', () => {
    it('should call GET /api/wms/inventory-count/:id', async () => {
      const mockData: InventoryCount = {
        id: 1, warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'pending',
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: mockData }),
      });

      const result = await fetchInventoryCountById(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count/1');
      expect(result).toEqual(mockData);
    });

    it('should return null on API error', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: 'Not Found' }),
      });

      const result = await fetchInventoryCountById(999);
      expect(result).toBeNull();
    });

    it('should return null on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      const result = await fetchInventoryCountById(1);
      expect(result).toBeNull();
    });
  });

  // ---------- createInventoryCount ----------

  describe('createInventoryCount', () => {
    it('should call POST /api/wms/inventory-count with correct body', async () => {
      const createData: InventoryCount = {
        warehouseId: 'WH-001',
        locationCode: 'A-01',
        sku: 'SKU001',
        systemQuantity: 100,
        status: 'pending',
      };

      const responseData = { ...createData, id: 1 };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: responseData }),
      });

      const result = await createInventoryCount(createData);

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createData),
      });
      expect(result).toEqual(responseData);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: '创建失败' }),
      });

      await expect(createInventoryCount({
        warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001', systemQuantity: 100, status: 'pending',
      })).rejects.toThrow('创建失败');
    });
  });

  // ---------- updateInventoryCount ----------

  describe('updateInventoryCount', () => {
    it('should call PUT /api/wms/inventory-count/:id with correct body', async () => {
      const updateData: Partial<InventoryCount> = {
        actualQuantity: 98,
        status: 'counted',
        counter: '张三',
      };

      const responseData: InventoryCount = {
        id: 1, warehouseId: 'WH-001', locationCode: 'A-01', sku: 'SKU001',
        systemQuantity: 100, actualQuantity: 98, variance: -2,
        counter: '张三', status: 'counted',
      };

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, data: responseData }),
      });

      const result = await updateInventoryCount(1, updateData);

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });
      expect(result).toEqual(responseData);
    });

    it('should throw error on API failure', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: '更新失败' }),
      });

      await expect(updateInventoryCount(1, { status: 'counted' })).rejects.toThrow('更新失败');
    });
  });

  // ---------- adjustInventoryCount ----------

  describe('adjustInventoryCount', () => {
    it('should call POST /api/wms/inventory-count/adjust with id and adjustBy', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0, message: '调整成功' }),
      });

      const result = await adjustInventoryCount(1, 'admin');

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 1, adjustBy: 'admin' }),
      });
      expect(result).toEqual({ success: true, message: '调整成功' });
    });

    it('should return success=false when API returns non-zero code', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1, message: '调整失败' }),
      });

      const result = await adjustInventoryCount(1, 'admin');
      expect(result).toEqual({ success: false, message: '调整失败' });
    });

    it('should return success=false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      const result = await adjustInventoryCount(1, 'admin');
      expect(result).toEqual({ success: false, message: 'Network Error' });
    });

    it('should use default message when API returns no message', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0 }),
      });

      const result = await adjustInventoryCount(1, 'admin');
      expect(result.success).toBe(true);
      expect(result.message).toBe('调整成功');
    });
  });

  // ---------- deleteInventoryCount ----------

  describe('deleteInventoryCount', () => {
    it('should call DELETE /api/wms/inventory-count/:id', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 0 }),
      });

      const result = await deleteInventoryCount(1);

      expect(mockFetch).toHaveBeenCalledWith('/api/wms/inventory-count/1', { method: 'DELETE' });
      expect(result).toBe(true);
    });

    it('should return false when API returns non-zero code', async () => {
      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ code: 1 }),
      });

      const result = await deleteInventoryCount(1);
      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network Error'));

      const result = await deleteInventoryCount(1);
      expect(result).toBe(false);
    });
  });
});
