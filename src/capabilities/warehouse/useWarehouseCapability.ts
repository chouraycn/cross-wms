/**
 * 仓储能力统一 Hook
 *
 * 合并以下5个 Hook/Context 为1个：
 * - useWarehouseData
 * - useTransitData
 * - useInventoryData
 * - useDashboardData
 * - DashboardDataContext
 *
 * 核心实现逻辑：
 * - 订阅 warehouseCapabilityStore 的 subscribeCapability
 * - 如果 includeDashboard=true，额外从 dashboardApi 拉取扩展数据
 * - warehouseFilter 时过滤数据并重算KPI
 * - 自动刷新：useAppSettings 的 dataRefreshInterval 或 options.refreshInterval
 */

import { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  VolumeHistoryPoint,
  InboundRecord,
  OutboundRecord,
  KpiData,
} from '../../types';
import {
  subscribeCapability,
  getWarehouseById as getStoreWarehouseById,
  getWarehouseFullView as getStoreWarehouseFullView,
  addWarehouse as storeAddWarehouse,
  updateWarehouse as storeUpdateWarehouse,
  removeWarehouse as storeRemoveWarehouse,
  addTransitOrder as storeAddTransitOrder,
  updateTransitOrder as storeUpdateTransitOrder,
  removeTransitOrder as storeRemoveTransitOrder,
  addInventoryItem as storeAddInventoryItem,
  updateInventoryItem as storeUpdateInventoryItem,
  removeInventoryItem as storeRemoveInventoryItem,
} from './warehouseCapabilityStore';
import { dashboardApi } from './dashboardApi';
import { calcUtilizationByItems } from '../../utils/volumeCalculator';
import { AppSettingsContext } from '../../contexts/AppSettingsContext';
import type { AppSettings } from '../../contexts/AppSettingsContext';

// ====== 类型定义 ======

export interface WarehouseCapabilityData {
  // 核心数据
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];

  // Dashboard 扩展数据（仅 includeDashboard=true 时加载）
  volumeHistory: VolumeHistoryPoint[];
  inboundRecords: InboundRecord[];
  outboundRecords: OutboundRecord[];
  kpiData: KpiData | null;
  transitStatusDistribution: Array<{ name: string; value: number; color: string }>;

  // 状态
  loading: boolean;
  error: string | null;

  // 操作
  refresh: () => void;
  getWarehouseById: (id: string) => Warehouse | undefined;
  getWarehouseFullView: (id: string) => { warehouse: Warehouse | undefined; transit: TransitOrder[]; inventory: InventoryItem[] };

  // 写操作（来自 Store）
  addWarehouse: (wh: Warehouse) => Promise<void>;
  updateWarehouse: (wh: Warehouse) => Promise<void>;
  removeWarehouse: (id: string) => Promise<void>;
  addTransitOrder: (order: TransitOrder) => Promise<void>;
  updateTransitOrder: (order: TransitOrder) => Promise<void>;
  removeTransitOrder: (id: string) => Promise<void>;
  addInventoryItem: (item: InventoryItem) => Promise<void>;
  updateInventoryItem: (item: InventoryItem) => Promise<void>;
  removeInventoryItem: (id: string) => Promise<void>;

  // 容积计算
  getUtilization: (wh: Warehouse) => number;
}

export interface UseWarehouseCapabilityOptions {
  /** 是否包含Dashboard扩展数据 */
  includeDashboard?: boolean;
  /** 按仓库筛选 */
  warehouseFilter?: string;
  /** 自动刷新 */
  autoRefresh?: boolean;
  /** 刷新间隔（毫秒），默认 30000 */
  refreshInterval?: number;
}

// ====== Hook 实现 ======

export function useWarehouseCapability(options: UseWarehouseCapabilityOptions = {}): WarehouseCapabilityData {
  const {
    includeDashboard = false,
    warehouseFilter,
    autoRefresh: optionsAutoRefresh = false,
    refreshInterval: optionsRefreshInterval = 30000,
  } = options;

  // 安全获取 AppSettings — 使用 useContext 直接读取，避免 useAppSettings() 在 Provider 外抛异常
  // 防御性 optional chaining：Provider 未就绪或 settings.dashboard 缺失时回退到默认值
  const settingsCtx = useContext(AppSettingsContext);
  const settings: AppSettings | null = settingsCtx?.settings ?? null;
  const settingsRefreshInterval = (settings?.dashboard?.dataRefreshInterval || 30) * 1000;

  const effectiveAutoRefresh = optionsAutoRefresh || includeDashboard;
  const effectiveRefreshInterval = includeDashboard ? settingsRefreshInterval : optionsRefreshInterval;

  // ====== 核心数据状态 ======
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // ====== Dashboard 扩展数据状态 ======
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryPoint[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [transitStatusDistribution, setTransitStatusDistribution] = useState<Array<{ name: string; value: number; color: string }>>([]);

  // ====== 加载状态 ======
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ====== 刷新控制 ======
  const [refreshKey, setRefreshKey] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // ====== 订阅 Store 变更（核心数据实时同步） ======
  useEffect(() => {
    const unsub = subscribeCapability((state) => {
      if (!mountedRef.current) return;
      setWarehouses(state.warehouses);
      setTransitOrders(state.transitOrders);
      setInventory(state.inventory);
    });
    return unsub;
  }, []);

  // ====== Dashboard 扩展数据拉取 ======
  useEffect(() => {
    if (!includeDashboard) return;

    let cancelled = false;

    const fetchDashboardData = async () => {
      setLoading(true);
      setError(null);

      try {
        const results = await Promise.allSettled([
          dashboardApi.getVolumeHistory(),
          dashboardApi.getInboundRecords(),
          dashboardApi.getOutboundRecords(),
          dashboardApi.getKpiData(),
          dashboardApi.getTransitStatusDistribution(),
        ]);

        if (cancelled) return;

        const volHist = results[0].status === 'fulfilled' ? results[0].value : [];
        const inRecs = results[1].status === 'fulfilled' ? results[1].value : [];
        const outRecs = results[2].status === 'fulfilled' ? results[2].value : [];
        const kpi = results[3].status === 'fulfilled' ? results[3].value : null;
        const statusDist = results[4].status === 'fulfilled' ? results[4].value : [];

        // 打印失败警告
        const apiNames = ['getVolumeHistory', 'getInboundRecords', 'getOutboundRecords', 'getKpiData', 'getTransitStatusDistribution'];
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.warn(`数据获取失败 [${apiNames[index]}]:`, result.reason);
          }
        });

        setVolumeHistory(volHist);
        setInboundRecords(inRecs);
        setOutboundRecords(outRecs);
        setKpiData(kpi);
        setTransitStatusDistribution(statusDist);
      } catch (err) {
        if (cancelled) return;
        console.error('Dashboard 数据获取过程发生错误:', err);
        setError(err instanceof Error ? err.message : '数据加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboardData();

    return () => {
      cancelled = true;
    };
  }, [includeDashboard, refreshKey]);

  // 非 Dashboard 模式下，初次加载标记完成
  useEffect(() => {
    if (!includeDashboard && warehouses.length >= 0) {
      setLoading(false);
    }
  }, [includeDashboard, warehouses]);

  // ====== 监听数据源配置变化 ======
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'crosswms_datasource_config') {
        refresh();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refresh]);

  // ====== 自动刷新 ======
  useEffect(() => {
    if (!effectiveAutoRefresh) return;

    const timer = setInterval(() => {
      refresh();
    }, effectiveRefreshInterval);

    return () => clearInterval(timer);
  }, [effectiveAutoRefresh, effectiveRefreshInterval, refresh]);

  // ====== 按仓库筛选数据 ======
  const filteredData = useMemo(() => {
    if (!warehouseFilter || warehouseFilter === '__all__') {
      return {
        warehouses,
        transitOrders,
        inventory,
        volumeHistory,
        inboundRecords,
        outboundRecords,
        kpiData,
        transitStatusDistribution,
      };
    }

    // 过滤出特定仓库的数据
    const filteredWarehouses = warehouses.filter((w) => w.id === warehouseFilter);
    const filteredTransitOrders = transitOrders.filter(
      (t) => t.fromWarehouseId === warehouseFilter || t.toWarehouseId === warehouseFilter
    );
    const filteredInventory = inventory.filter((item) => item.warehouseId === warehouseFilter);
    const filteredInbound = inboundRecords.filter((r) => r.warehouseId === warehouseFilter);
    const filteredOutbound = outboundRecords.filter((r) => r.warehouseId === warehouseFilter);

    // 重新计算 KPI（基于过滤后的数据）
    const totalTransitVolume = parseFloat(
      filteredTransitOrders
        .filter((t) => t.status !== 'arrived')
        .reduce((s, t) => s + t.volume, 0)
        .toFixed(1)
    );

    const totalItemsSum = filteredWarehouses.reduce((s, w) => {
      return s + (Number.isFinite(w.totalItems) && w.totalItems > 0 ? w.totalItems : Number.isFinite(w.totalVolume) ? w.totalVolume : 0);
    }, 0);
    const usedItemsSum = filteredWarehouses.reduce((s, w) => {
      return s + (Number.isFinite(w.usedItems) && w.usedItems >= 0 ? w.usedItems : Number.isFinite(w.usedVolume) ? w.usedVolume : 0);
    }, 0);
    const totalVolumeUtilization = totalItemsSum > 0 ? parseFloat(((usedItemsSum / totalItemsSum) * 100).toFixed(1)) : 0;

    const pendingInboundOrders = filteredInbound.filter((r) => r.status === 'pending').length;

    const totalInventoryQty = filteredInventory.reduce((s, item) => s + item.quantity, 0);
    const avgDailyOutbound = Math.max(1, Math.round(totalInventoryQty / 120));
    const inventoryDepth = parseFloat((totalInventoryQty / avgDailyOutbound).toFixed(0));

    const filteredKpiData: KpiData = {
      totalTransitVolume,
      totalVolumeUtilization,
      pendingInboundOrders,
      todayOutboundCount: kpiData?.todayOutboundCount ?? 0,
      inventoryDepth,
    };

    // 重新计算状态分布
    const filteredStatusDistribution = [
      { name: '已发出', value: filteredTransitOrders.filter((t) => t.status === 'dispatched').length, color: '#9CA3AF' },
      { name: '运输中', value: filteredTransitOrders.filter((t) => t.status === 'in_transit').length, color: '#111827' },
      { name: '清关中', value: filteredTransitOrders.filter((t) => t.status === 'customs').length, color: '#6B7280' },
      { name: '已到达', value: filteredTransitOrders.filter((t) => t.status === 'arrived').length, color: '#D1D5DB' },
    ];

    return {
      warehouses: filteredWarehouses,
      transitOrders: filteredTransitOrders,
      inventory: filteredInventory,
      volumeHistory,
      inboundRecords: filteredInbound,
      outboundRecords: filteredOutbound,
      kpiData: filteredKpiData,
      transitStatusDistribution: filteredStatusDistribution,
    };
  }, [warehouseFilter, warehouses, transitOrders, inventory, volumeHistory, inboundRecords, outboundRecords, kpiData]);

  // ====== 辅助方法 ======

  const getWarehouseById = useCallback((id: string): Warehouse | undefined => {
    return getStoreWarehouseById(id);
  }, []);

  const getWarehouseFullViewFn = useCallback((id: string) => {
    return getStoreWarehouseFullView(id);
  }, []);

  const getUtilization = useCallback((wh: Warehouse): number => {
    return calcUtilizationByItems(wh);
  }, []);

  // ====== 返回值 ======
  return {
    ...filteredData,
    loading,
    error,
    refresh,
    getWarehouseById,
    getWarehouseFullView: getWarehouseFullViewFn,
    addWarehouse: storeAddWarehouse,
    updateWarehouse: storeUpdateWarehouse,
    removeWarehouse: storeRemoveWarehouse,
    addTransitOrder: storeAddTransitOrder,
    updateTransitOrder: storeUpdateTransitOrder,
    removeTransitOrder: storeRemoveTransitOrder,
    addInventoryItem: storeAddInventoryItem,
    updateInventoryItem: storeUpdateInventoryItem,
    removeInventoryItem: storeRemoveInventoryItem,
    getUtilization,
  };
}
