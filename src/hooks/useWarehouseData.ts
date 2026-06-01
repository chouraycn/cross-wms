/**
 * 仓库数据 Hook
 *
 * 整合 warehouseStore（localStorage 持久化）和 dashboardApi，
 * 提供统一的仓库数据访问接口：
 * - 优先从 store 获取本地持久化的仓库
 * - 支持 dashboardApi 作为远程数据源
 * - 加载状态 + 错误处理
 * - 容积率计算工具
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { Warehouse } from '../types';
import { dashboardApi } from '../services/dashboardApi';
import {
  subscribeWarehouses,
  getWarehouses as getStoreWarehouses,
  addWarehouse as addGlobalWarehouse,
  removeWarehouse as removeGlobalWarehouse,
  updateWarehouse as updateGlobalWarehouse,
  setWarehouses as setGlobalWarehouses,
} from '../stores/warehouseStore';
import { calcUtilizationByItems } from '../utils/volumeCalculator';

export interface WarehouseData {
  warehouses: Warehouse[];
  loading: boolean;
  error: string | null;
  refresh: () => void;
  /** 计算仓库容积率 */
  getUtilization: (wh: Warehouse) => number;
  /** 添加仓库（本地持久化） */
  addWarehouse: (wh: Warehouse) => void;
  /** 删除仓库（本地持久化） */
  removeWarehouse: (id: string) => void;
  /** 更新仓库（本地持久化） */
  updateWarehouse: (wh: Warehouse) => void;
}

export interface UseWarehouseDataOptions {
  /** 是否从 dashboardApi 同步远程数据到 store */
  syncFromApi?: boolean;
  autoRefresh?: boolean;
  refreshInterval?: number; // 毫秒，默认 30000
}

export function useWarehouseData(options: UseWarehouseDataOptions = {}): WarehouseData {
  const { syncFromApi = false, autoRefresh = false, refreshInterval = 30000 } = options;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** 从 API 同步远程数据到本地 store */
  const syncRemoteData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const remoteWarehouses = await dashboardApi.getWarehouses();
      // 如果远程返回了数据，合并到本地 store
      if (remoteWarehouses.length > 0) {
        const localWarehouses = getStoreWarehouses();
        // 合并策略：远程数据中已有的仓库更新本地，本地新增的仓库保留
        const localIdSet = new Set(localWarehouses.map((w) => w.id));
        const merged = [...localWarehouses];
        for (const rw of remoteWarehouses) {
          const localIdx = merged.findIndex((w) => w.id === rw.id);
          if (localIdx >= 0) {
            // 远程仓库数据覆盖本地（远程为权威数据源）
            merged[localIdx] = rw;
          } else if (!localIdSet.has(rw.id)) {
            // 新仓库，追加
            merged.push(rw);
          }
        }
        setGlobalWarehouses(merged);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(`仓库数据同步失败: ${message}`);
      console.error('仓库数据同步失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  /** 订阅本地 store 变化 */
  useEffect(() => {
    const unsub = subscribeWarehouses((ws) => {
      setWarehouses([...ws]);
      setLoading(false);
    });
    return unsub;
  }, []);

  /** 初次加载：如果需要从 API 同步 */
  useEffect(() => {
    if (syncFromApi) {
      syncRemoteData();
    } else {
      setLoading(false);
    }
  }, [syncFromApi, syncRemoteData]);

  /** 自动刷新 */
  useEffect(() => {
    if (!autoRefresh || !syncFromApi) return;
    const timer = setInterval(() => {
      syncRemoteData();
    }, refreshInterval);
    return () => clearInterval(timer);
  }, [autoRefresh, syncFromApi, refreshInterval, syncRemoteData]);

  const getUtilization = useCallback((wh: Warehouse): number => {
    return calcUtilizationByItems(wh);
  }, []);

  return {
    warehouses,
    loading,
    error,
    refresh: syncRemoteData,
    getUtilization,
    addWarehouse: addGlobalWarehouse,
    removeWarehouse: removeGlobalWarehouse,
    updateWarehouse: updateGlobalWarehouse,
  };
}
