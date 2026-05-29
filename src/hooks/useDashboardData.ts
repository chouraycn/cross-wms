/**
 * 仪表盘数据 Hook
 *
 * 统一获取仪表盘所有数据，支持：
 * - 加载状态管理
 * - 错误状态处理
 * - 自动刷新（可配置）
 * - 支持选择特定仓库
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  Warehouse,
  TransitOrder,
  InventoryItem,
  VolumeHistoryPoint,
  InboundRecord,
  OutboundRecord,
  KpiData,
} from '../types';
import { dashboardApi } from '../services/dashboardApi';
import { transitStatusDistribution as defaultTransitStatusDistribution } from '../data/mockData';
import { calcOverallByVolume } from '../utils/volumeCalculator';

export interface DashboardData {
  warehouses: Warehouse[];
  transitOrders: TransitOrder[];
  inventory: InventoryItem[];
  volumeHistory: VolumeHistoryPoint[];
  inboundRecords: InboundRecord[];
  outboundRecords: OutboundRecord[];
  kpiData: KpiData;
  transitStatusDistribution: Array<{ name: string; value: number; color: string }>;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

export interface UseDashboardDataOptions {
  warehouseId?: string; // 选择特定仓库，undefined 表示所有仓库
  autoRefresh?: boolean;
  refreshInterval?: number; // 自动刷新间隔（毫秒），默认 30000
}

export function useDashboardData(options: UseDashboardDataOptions = {}): DashboardData {
  const { warehouseId, autoRefresh = false, refreshInterval = 30000 } = options;

  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [transitOrders, setTransitOrders] = useState<TransitOrder[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [volumeHistory, setVolumeHistory] = useState<VolumeHistoryPoint[]>([]);
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([]);
  const [outboundRecords, setOutboundRecords] = useState<OutboundRecord[]>([]);
  const [kpiData, setKpiData] = useState<KpiData>({
    totalTransitVolume: 0,
    totalVolumeUtilization: 0,
    pendingInboundOrders: 0,
    todayOutboundCount: 0,
    inventoryDepth: 0,
  });
  const [transitStatusDistribution, setTransitStatusDistribution] = useState(
    defaultTransitStatusDistribution
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [
        warehousesData,
        transitOrdersData,
        inventoryData,
        volumeHistoryData,
        inboundRecordsData,
        outboundRecordsData,
        kpiDataResult,
        statusDistribution,
      ] = await Promise.all([
        dashboardApi.getWarehouses(),
        dashboardApi.getTransitOrders(),
        dashboardApi.getInventory(),
        dashboardApi.getVolumeHistory(),
        dashboardApi.getInboundRecords(),
        dashboardApi.getOutboundRecords(),
        dashboardApi.getKpiData(),
        dashboardApi.getTransitStatusDistribution(),
      ]);

      setWarehouses(warehousesData);
      setTransitOrders(transitOrdersData);
      setInventory(inventoryData);
      setVolumeHistory(volumeHistoryData);
      setInboundRecords(inboundRecordsData);
      setOutboundRecords(outboundRecordsData);
      setKpiData(kpiDataResult);
      setTransitStatusDistribution(statusDistribution);
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setError(`数据加载失败: ${message}`);
      console.error('仪表盘数据加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 首次加载数据
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh) return;

    const timer = setInterval(() => {
      fetchAllData();
    }, refreshInterval);

    return () => clearInterval(timer);
  }, [autoRefresh, refreshInterval, fetchAllData]);

  // 根据选择的仓库过滤数据
  const filteredData = useMemo(() => {
    if (!warehouseId || warehouseId === '__all__') {
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
    const filteredWarehouses = warehouses.filter(w => w.id === warehouseId);
    const filteredTransitOrders = transitOrders.filter(
      t => t.fromWarehouseId === warehouseId || t.toWarehouseId === warehouseId
    );
    const filteredInventory = inventory.filter(item => item.warehouseId === warehouseId);
    const filteredInbound = inboundRecords.filter(r => r.warehouseId === warehouseId);
    const filteredOutbound = outboundRecords.filter(r => r.warehouseId === warehouseId);

    // 重新计算 KPI（基于过滤后的数据）
    const totalTransitVolume = parseFloat(
      filteredTransitOrders
        .filter(t => t.status !== 'arrived')
        .reduce((s, t) => s + t.volume, 0)
        .toFixed(1)
    );

    const totalVolumeUtilization = calcOverallByVolume(filteredWarehouses);

    const pendingInboundOrders = filteredInbound.filter(r => r.status === 'pending').length;

    const totalInventoryQty = filteredInventory.reduce((s, item) => s + item.quantity, 0);
    const avgDailyOutbound = Math.max(1, Math.round(totalInventoryQty / 120));
    const inventoryDepth = parseFloat((totalInventoryQty / avgDailyOutbound).toFixed(0));

    const filteredKpiData: KpiData = {
      totalTransitVolume,
      totalVolumeUtilization,
      pendingInboundOrders,
      todayOutboundCount: kpiData.todayOutboundCount, // 使用原始数据
      inventoryDepth,
    };

    // 重新计算状态分布
    const filteredStatusDistribution = [
      { name: '已发出', value: filteredTransitOrders.filter(t => t.status === 'dispatched').length, color: '#9CA3AF' },
      { name: '运输中', value: filteredTransitOrders.filter(t => t.status === 'in_transit').length, color: '#111827' },
      { name: '清关中', value: filteredTransitOrders.filter(t => t.status === 'customs').length, color: '#6B7280' },
      { name: '已到达', value: filteredTransitOrders.filter(t => t.status === 'arrived').length, color: '#D1D5DB' },
    ];

    return {
      warehouses: filteredWarehouses,
      transitOrders: filteredTransitOrders,
      inventory: filteredInventory,
      volumeHistory, // 容积历史通常不按仓库过滤
      inboundRecords: filteredInbound,
      outboundRecords: filteredOutbound,
      kpiData: filteredKpiData,
      transitStatusDistribution: filteredStatusDistribution,
    };
  }, [warehouseId, warehouses, transitOrders, inventory, volumeHistory, inboundRecords, outboundRecords, kpiData]);

  return {
    ...filteredData,
    loading,
    error,
    refresh: fetchAllData,
  };
}
