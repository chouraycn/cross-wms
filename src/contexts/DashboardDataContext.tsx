import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import type { Warehouse, TransitOrder, InventoryItem, VolumeHistoryPoint, InboundRecord, OutboundRecord, KpiData } from '../types';
import { dashboardApi } from '../services/dashboardApi';
import { useAppSettings } from './AppSettingsContext';

interface DashboardDataContextValue {
  // 数据
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];
  volumeHistory: VolumeHistoryPoint[];
  inboundRecords: InboundRecord[];
  outboundRecords: OutboundRecord[];
  kpiData: KpiData | null;
  transitStatusDistribution: Array<{ name: string; value: number; color: string }>;

  // 加载状态
  loading: boolean;
  error: string | null;

  // 刷新
  refresh: () => void;
}

const DashboardDataContext = createContext<DashboardDataContextValue | null>(null);

export const DashboardDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryPoint[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [transitStatusDistribution, setTransitStatusDistribution] = useState<Array<{ name: string; value: number; color: string }>>([]);

  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // 监听配置变化 - 当 localStorage 中的配置改变时自动刷新
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'crosswms_datasource_config') {
        // 配置已改变，触发刷新
        refresh();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refresh]);

  // Auto-refresh timer - 根据设置中的 dataRefreshInterval 自动刷新数据
  const { settings } = useAppSettings();
  useEffect(() => {
    const intervalSeconds = settings.dashboard.dataRefreshInterval;
    
    // 如果 interval 为 0 或负数，则禁用自动刷新
    if (!intervalSeconds || intervalSeconds <= 0) {
      return undefined;
    }

    const intervalMs = intervalSeconds * 1000;
    
    const timer = setInterval(() => {
      refresh();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [settings.dashboard.dataRefreshInterval, refresh]);

  useEffect(() => {
    let cancelled = false;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.allSettled([
          dashboardApi.getWarehouses(),
          dashboardApi.getTransitOrders(),
          dashboardApi.getInventory(),
          dashboardApi.getVolumeHistory(),
          dashboardApi.getInboundRecords(),
          dashboardApi.getOutboundRecords(),
          dashboardApi.getKpiData(),
          dashboardApi.getTransitStatusDistribution(),
        ]);

        if (cancelled) return;

        // 处理 Promise.allSettled 结果，提供容错能力
        const whs = results[0].status === 'fulfilled' ? results[0].value : [];
        const orders = results[1].status === 'fulfilled' ? results[1].value : [];
        const inv = results[2].status === 'fulfilled' ? results[2].value : [];
        const volHist = results[3].status === 'fulfilled' ? results[3].value : [];
        const inRecs = results[4].status === 'fulfilled' ? results[4].value : [];
        const outRecs = results[5].status === 'fulfilled' ? results[5].value : [];
        const kpi = results[6].status === 'fulfilled' ? results[6].value : null;
        const statusDist = results[7].status === 'fulfilled' ? results[7].value : [];

        // 打印失败警告
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            const apiNames = ['getWarehouses', 'getTransitOrders', 'getInventory', 'getVolumeHistory', 'getInboundRecords', 'getOutboundRecords', 'getKpiData', 'getTransitStatusDistribution'];
            console.warn(`数据获取失败 [${apiNames[index]}]:`, result.reason);
          }
        });

        setWarehouses(whs);
        setTransitOrders(orders);
        setInventory(inv);
        setVolumeHistory(volHist);
        setInboundRecords(inRecs);
        setOutboundRecords(outRecs);
        setKpiData(kpi);
        setTransitStatusDistribution(statusDist);
      } catch (err) {
        // 这里的 catch 主要捕获 Promise.allSettled 之外的异常（理论上不应该发生）
        if (cancelled) return;
        console.error('数据获取过程发生未知错误:', err);
        setError(err instanceof Error ? err.message : '数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchAll();

    return () => { cancelled = true; };
  }, [refreshKey]);

  const value = useMemo(() => ({
    warehouses,
    transitOrders,
    inventory,
    volumeHistory,
    inboundRecords,
    outboundRecords,
    kpiData,
    transitStatusDistribution,
    loading,
    error,
    refresh,
  }), [
    warehouses, transitOrders, inventory, volumeHistory,
    inboundRecords, outboundRecords, kpiData, transitStatusDistribution,
    loading, error, refresh,
  ]);

  return (
    <DashboardDataContext.Provider value={value}>
      {children}
    </DashboardDataContext.Provider>
  );
};

export function useDashboardData(): DashboardDataContextValue {
  const ctx = useContext(DashboardDataContext);
  if (!ctx) {
    throw new Error('useDashboardData must be used within a DashboardDataProvider');
  }
  return ctx;
}

export default DashboardDataContext;
