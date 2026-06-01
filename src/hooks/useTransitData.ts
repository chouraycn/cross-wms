/**
 * 在途数据 Hook
 *
 * 统一获取在途订单和仓库列表数据，支持：
 * - 加载状态管理
 * - 错误状态处理
 * - 自动刷新（可配置）
 * - 仓库 ID → 仓库名映射
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { TransitOrder, Warehouse } from '../types';
import { dashboardApi } from '../services/dashboardApi';

export interface TransitData {
  transitOrders: TransitOrder[];
  warehouses: Warehouse[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** 根据仓库 ID 获取仓库对象 */
  getWarehouseById: (id: string) => Warehouse | undefined;
}

export interface UseTransitDataOptions {
  autoRefresh?: boolean;
  refreshInterval?: number; // 毫秒，默认 30000
}

export function useTransitData(options: UseTransitDataOptions = {}): TransitData {
  const { autoRefresh = false, refreshInterval = 30000 } = options;

  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [transitOrdersData, warehousesData] = await Promise.all([
        dashboardApi.getTransitOrders(),
        dashboardApi.getWarehouses(),
      ]);

      setTransitOrders(transitOrdersData);
      setWarehouses(warehousesData);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(`在途数据加载失败: ${message}`);
      console.error('在途数据加载失败:', err);
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
    transitOrders,
    warehouses,
    loading,
    error,
    refresh: fetchAllData,
    getWarehouseById,
  };
}
