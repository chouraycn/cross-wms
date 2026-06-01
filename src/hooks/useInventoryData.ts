/**
 * 库存数据 Hook
 *
 * 统一获取库存和仓库列表数据，支持：
 * - 加载状态管理
 * - 错误状态处理
 * - 自动刷新（可配置）
 * - 仓库 ID → 仓库名映射
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { InventoryItem, Warehouse } from '../types';
import { dashboardApi } from '../services/dashboardApi';

export interface InventoryData {
  inventory: InventoryItem[];
  warehouses: Warehouse[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** 根据仓库 ID 获取仓库对象 */
  getWarehouseById: (id: string) => Warehouse | undefined;
}

export interface UseInventoryDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // 毫秒，默认 30000
}

export function useInventoryData(options: UseInventoryDataOptions = {}): InventoryData {
  const { autoRefresh = false, refreshInterval = 30000 } = options;

  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [inventoryData, warehousesData] = await Promise.all([
        dashboardApi.getInventory(),
        dashboardApi.getWarehouses(),
      ]);

      setInventory(inventoryData);
      setWarehouses(warehousesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(`库存数据加载失败: ${message}`);
      console.error('库存数据加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchAllData();
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, fetchAllData]);

  const warehouseMap = useMemo(() => {
    const map = new Map<string, Warehouse>();
    warehouses.forEach((w) => map.set(w.id, w));
    return map;
  }, [warehouses]);

  const getWarehouseById = useCallback(
    (id: string): Warehouse | undefined => warehouseMap.get(id),
    [warehouseMap],
  );

  return {
    inventory,
    warehouses,
    loading,
    error,
    refresh: fetchAllData,
    getWarehouseById,
  };
}
