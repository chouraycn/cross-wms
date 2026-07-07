import React, { createContext, useContext, useEffect, useRef, useState, useCallback, useMemo } from 'react';
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
import { useDashboardSettings } from '../../contexts/AppSettingsContext';
import type { DashboardConfig } from '../../contexts/AppSettingsContext';

export interface WarehouseCapabilityData {
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];
  volumeHistory: VolumeHistoryPoint[];
  inboundRecords: InboundRecord[];
  outboundRecords: OutboundRecord[];
  kpiData: KpiData | null;
  transitStatusDistribution: Array<{ name: string; value: number; color: string }>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  ensureInventoryLoaded: () => Promise<void>;
  ensureTransitLoaded: () => Promise<void>;
  ensureDashboardLoaded: () => Promise<void>;
  isInventoryLoaded: boolean;
  isTransitLoaded: boolean;
  isDashboardLoaded: boolean;
  getWarehouseById: (id: string) => Warehouse | undefined;
  getWarehouseFullView: (id: string) => { warehouse: Warehouse | undefined; transit: TransitOrder[]; inventory: InventoryItem[] };
  addWarehouse: (wh: Warehouse) => Promise<void>;
  updateWarehouse: (wh: Warehouse) => Promise<void>;
  removeWarehouse: (id: string) => Promise<void>;
  addTransitOrder: (order: TransitOrder) => Promise<void>;
  updateTransitOrder: (order: TransitOrder) => Promise<void>;
  removeTransitOrder: (id: string) => Promise<void>;
  addInventoryItem: (item: InventoryItem) => Promise<void>;
  updateInventoryItem: (item: InventoryItem) => Promise<void>;
  removeInventoryItem: (id: string) => Promise<void>;
  getUtilization: (wh: Warehouse) => number;
}

interface WarehouseCapabilityProviderProps {
  children: React.ReactNode;
  includeDashboard?: boolean;
  refreshInterval?: number;
}

const WarehouseCapabilityContext = createContext<WarehouseCapabilityData | undefined>(undefined);

export const WarehouseCapabilityProvider: React.FC<WarehouseCapabilityProviderProps> = ({
  children,
  includeDashboard = false,
  refreshInterval,
}) => {
  const dashboardSettings = useDashboardSettings();
  const settings: DashboardConfig | null = dashboardSettings?.settings ?? null;
  const settingsRefreshInterval = (settings?.dataRefreshInterval || 30) * 1000;
  const effectiveRefreshInterval = refreshInterval ?? (includeDashboard ? settingsRefreshInterval : 30000);

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryPoint[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [transitStatusDistribution, setTransitStatusDistribution] = useState<Array<{ name: string; value: number; color: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const mountedRef = useRef(true);
  const fetchCountRef = useRef(0);

  const [isInventoryLoaded, setIsInventoryLoaded] = useState(false);
  const [isTransitLoaded, setIsTransitLoaded] = useState(false);
  const [isDashboardLoaded, setIsDashboardLoaded] = useState(false);
  const inventoryLoadingRef = useRef<Promise<void> | null>(null);
  const transitLoadingRef = useRef<Promise<void> | null>(null);
  const dashboardLoadingRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
    setIsInventoryLoaded(false);
    setIsTransitLoaded(false);
    setIsDashboardLoaded(false);
    inventoryLoadingRef.current = null;
    transitLoadingRef.current = null;
    dashboardLoadingRef.current = null;
  }, []);

  useEffect(() => {
    const unsub = subscribeCapability((state) => {
      if (!mountedRef.current) return;
      setWarehouses(state.warehouses);
      if (state.transitOrders.length > 0) {
        setTransitOrders(state.transitOrders);
        setIsTransitLoaded(true);
      }
      if (state.inventory.length > 0) {
        setInventory(state.inventory);
        setIsInventoryLoaded(true);
      }
    });
    return unsub;
  }, []);

  const loadInventoryData = useCallback(async () => {
    if (inventoryLoadingRef.current) return inventoryLoadingRef.current;

    const loadPromise = (async () => {
      try {
        const data = await dashboardApi.getInventory();
        if (!mountedRef.current) return;
        setInventory(data);
        setIsInventoryLoaded(true);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : '库存数据加载失败');
      }
    })();

    inventoryLoadingRef.current = loadPromise;
    return loadPromise;
  }, []);

  const loadTransitData = useCallback(async () => {
    if (transitLoadingRef.current) return transitLoadingRef.current;

    const loadPromise = (async () => {
      try {
        const data = await dashboardApi.getTransitOrders();
        if (!mountedRef.current) return;
        setTransitOrders(data);
        setIsTransitLoaded(true);
      } catch (err) {
        if (!mountedRef.current) return;
        setError(err instanceof Error ? err.message : '在途数据加载失败');
      }
    })();

    transitLoadingRef.current = loadPromise;
    return loadPromise;
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (dashboardLoadingRef.current) return dashboardLoadingRef.current;

    const loadPromise = (async () => {
      fetchCountRef.current++;
      const currentFetch = fetchCountRef.current;

      try {
        const results = await Promise.allSettled([
          dashboardApi.getVolumeHistory(),
          dashboardApi.getInboundRecords(),
          dashboardApi.getOutboundRecords(),
          dashboardApi.getKpiData(),
          dashboardApi.getTransitStatusDistribution(),
        ]);

        if (currentFetch !== fetchCountRef.current) return;

        const volHist = results[0].status === 'fulfilled' ? results[0].value : [];
        const inRecs = results[1].status === 'fulfilled' ? results[1].value : [];
        const outRecs = results[2].status === 'fulfilled' ? results[2].value : [];
        const kpi = results[3].status === 'fulfilled' ? results[3].value : null;
        const statusDist = results[4].status === 'fulfilled' ? results[4].value : [];

        setVolumeHistory(volHist);
        setInboundRecords(inRecs);
        setOutboundRecords(outRecs);
        setKpiData(kpi);
        setTransitStatusDistribution(statusDist);
        setIsDashboardLoaded(true);
      } catch (err) {
        if (currentFetch !== fetchCountRef.current) return;
        setError(err instanceof Error ? err.message : 'Dashboard数据加载失败');
      }
    })();

    dashboardLoadingRef.current = loadPromise;
    return loadPromise;
  }, []);

  const ensureInventoryLoaded = useCallback(async () => {
    if (isInventoryLoaded) return;
    await loadInventoryData();
  }, [isInventoryLoaded, loadInventoryData]);

  const ensureTransitLoaded = useCallback(async () => {
    if (isTransitLoaded) return;
    await loadTransitData();
  }, [isTransitLoaded, loadTransitData]);

  const ensureDashboardLoaded = useCallback(async () => {
    if (isDashboardLoaded) return;
    await loadDashboardData();
  }, [isDashboardLoaded, loadDashboardData]);

  useEffect(() => {
    if (!includeDashboard) return;

    let cancelled = false;
    fetchCountRef.current++;
    const currentFetch = fetchCountRef.current;

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

        if (cancelled || currentFetch !== fetchCountRef.current) return;

        const volHist = results[0].status === 'fulfilled' ? results[0].value : [];
        const inRecs = results[1].status === 'fulfilled' ? results[1].value : [];
        const outRecs = results[2].status === 'fulfilled' ? results[2].value : [];
        const kpi = results[3].status === 'fulfilled' ? results[3].value : null;
        const statusDist = results[4].status === 'fulfilled' ? results[4].value : [];

        setVolumeHistory(volHist);
        setInboundRecords(inRecs);
        setOutboundRecords(outRecs);
        setKpiData(kpi);
        setTransitStatusDistribution(statusDist);
        setIsDashboardLoaded(true);
      } catch (err) {
        if (cancelled || currentFetch !== fetchCountRef.current) return;
        setError(err instanceof Error ? err.message : '数据加载失败');
      } finally {
        if (!cancelled && currentFetch === fetchCountRef.current) {
          setLoading(false);
        }
      }
    };

    fetchDashboardData();

    return () => {
      cancelled = true;
    };
  }, [includeDashboard, refreshKey]);

  useEffect(() => {
    if (!includeDashboard && warehouses.length >= 0) {
      setLoading(false);
    }
  }, [includeDashboard, warehouses]);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cdf-know-clow_datasource_config') {
        refresh();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [refresh]);

  useEffect(() => {
    if (!includeDashboard) return;

    const timer = setInterval(() => {
      refresh();
    }, effectiveRefreshInterval);

    return () => clearInterval(timer);
  }, [includeDashboard, effectiveRefreshInterval, refresh]);

  const getWarehouseById = useCallback((id: string): Warehouse | undefined => {
    return getStoreWarehouseById(id);
  }, []);

  const getWarehouseFullView = useCallback((id: string) => {
    return getStoreWarehouseFullView(id);
  }, []);

  const getUtilization = useCallback((wh: Warehouse): number => {
    return calcUtilizationByItems(wh);
  }, []);

  const value = useMemo<WarehouseCapabilityData>(() => ({
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
    ensureInventoryLoaded,
    ensureTransitLoaded,
    ensureDashboardLoaded,
    isInventoryLoaded,
    isTransitLoaded,
    isDashboardLoaded,
    getWarehouseById,
    getWarehouseFullView,
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
  }), [
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
    ensureInventoryLoaded,
    ensureTransitLoaded,
    ensureDashboardLoaded,
    isInventoryLoaded,
    isTransitLoaded,
    isDashboardLoaded,
    getWarehouseById,
    getWarehouseFullView,
    getUtilization,
  ]);

  return (
    <WarehouseCapabilityContext.Provider value={value}>
      {children}
    </WarehouseCapabilityContext.Provider>
  );
};

export function useWarehouseCapabilityContext(): WarehouseCapabilityData {
  const ctx = useContext(WarehouseCapabilityContext);
  if (!ctx) {
    throw new Error('useWarehouseCapabilityContext must be used within WarehouseCapabilityProvider');
  }
  return ctx;
}
