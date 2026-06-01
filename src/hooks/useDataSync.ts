/**
 * 数据同步 Hook
 *
 * 定期调用 dashboardApi 刷新数据，支持：
 * - 可配置轮询间隔
 * - 手动触发同步
 * - 同步状态指示（isSyncing / lastSyncTime）
 * - mock 模式下不轮询
 * - 组件卸载时自动清理 interval
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { dashboardApi } from '../services/dashboardApi';
import { useAppSettings } from '../contexts/AppSettingsContext';

export interface DataSyncState {
  /** 上次同步时间 */
  lastSyncTime: Date | null;
  /** 是否正在同步中 */
  isSyncing: boolean;
  /** 上次同步是否出错 */
  lastError: string | null;
  /** 手动触发同步 */
  syncNow: () => Promise<void>;
}

export interface UseDataSyncOptions {
  /** 轮询间隔（毫秒），默认 5 分钟 */
  interval?: number;
  /** 是否启用轮询，默认根据数据源模式自动判断 */
  enabled?: boolean;
}

export function useDataSync(options: UseDataSyncOptions = {}): DataSyncState {
  const { interval = 5 * 60 * 1000, enabled } = options;
  const { settings } = useAppSettings();
  const mode = settings.dashboard.dataSourceMode;

  // mock 模式不轮询，api 和 tencent-docs 模式启用
  const shouldPoll = enabled !== undefined ? enabled : mode !== 'mock';

  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  // 使用 ref 防止 syncNow 被重复调用
  const syncingRef = useRef(false);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);
    setLastError(null);

    try {
      // 同步所有核心数据（触发 dashboardApi 缓存更新）
      await Promise.all([
        dashboardApi.getWarehouses(),
        dashboardApi.getTransitOrders(),
        dashboardApi.getInventory(),
        dashboardApi.getVolumeHistory(),
        dashboardApi.getInboundRecords(),
        dashboardApi.getOutboundRecords(),
        dashboardApi.getKpiData(),
        dashboardApi.getTransitStatusDistribution(),
      ]);

      setLastSyncTime(new Date());
    } catch (err) {
      const message = err instanceof Error ? err.message : '未知错误';
      setLastError(message);
      console.error('数据同步失败:', err);
    } finally {
      setIsSyncing(false);
      syncingRef.current = false;
    }
  }, []);

  // 首次加载时同步一次
  useEffect(() => {
    if (shouldPoll) {
      syncNow();
    }
  }, [shouldPoll, syncNow]);

  // 定时轮询
  useEffect(() => {
    if (!shouldPoll) return;

    const timer = setInterval(() => {
      syncNow();
    }, interval);

    return () => clearInterval(timer);
  }, [shouldPoll, interval, syncNow]);

  return {
    lastSyncTime,
    isSyncing,
    lastError,
    syncNow,
  };
}
