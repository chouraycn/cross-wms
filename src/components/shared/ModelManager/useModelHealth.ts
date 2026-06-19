/**
 * useModelHealth — 模型健康监控 Hook
 *
 * 功能：
 * - 批量检测所有已启用模型的 API 可用性
 * - 缓存检测结果（modelId → HealthCheckItem）
 * - 提供状态指示灯颜色映射
 * - 支持手动触发检测
 * - 支持自动定时刷新（默认每 5 分钟）
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as api from '../../../services/api';
import type { ModelConfig } from '../../../types/models';
import type { HealthCheckItem } from '../../../services/api';

export type HealthStatus = 'healthy' | 'unhealthy' | 'timeout' | 'skipped' | 'unknown';

export interface UseModelHealthReturn {
  /** 模型健康状态映射 (modelId → HealthCheckItem) */
  healthMap: Record<string, HealthCheckItem>;
  /** 是否正在检测中 */
  isChecking: boolean;
  /** 上次检测时间 */
  lastCheckedAt: string | null;
  /** 上次检测错误信息（null 表示无错误） */
  checkError: string | null;
  /** 是否启用自动刷新 */
  autoRefreshEnabled: boolean;
  /** 触发批量健康检查 */
  checkHealth: (models?: ModelConfig[]) => Promise<void>;
  /** 切换自动刷新开关 */
  toggleAutoRefresh: () => void;
  /** 获取单个模型的状态 */
  getModelStatus: (modelId: string) => HealthStatus;
  /** 获取状态指示灯颜色 */
  getStatusColor: (status: HealthStatus) => string;
  /** 获取状态标签文字 */
  getStatusLabel: (status: HealthStatus) => string;
  /** 获取延迟显示文字 */
  getLatencyText: (modelId: string) => string;
}

/** 状态 → 颜色映射 */
const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: '#10B981',
  unhealthy: '#EF4444',
  timeout: '#F59E0B',
  skipped: '#9CA3AF',
  unknown: '#D1D5DB',
};

/** 状态 → 标签文字 */
const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: '正常',
  unhealthy: '异常',
  timeout: '超时',
  skipped: '未检测',
  unknown: '未知',
};

/** 自动刷新间隔（毫秒） */
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000; // 5 分钟

export function useModelHealth(): UseModelHealthReturn {
  const [healthMap, setHealthMap] = useState<Record<string, HealthCheckItem>>({});
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const checkingRef = useRef(false);
  const autoRefreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastModelsRef = useRef<ModelConfig[] | undefined>(undefined);

  const checkHealth = useCallback(async (models?: ModelConfig[]) => {
    // 防止重复触发
    if (checkingRef.current) return;
    checkingRef.current = true;
    setIsChecking(true);
    // 保存最近一次检测的模型列表，用于自动刷新
    if (models) {
      lastModelsRef.current = models;
    }

    try {
      const results = await api.healthCheckModels(models);
      const map: Record<string, HealthCheckItem> = {};
      for (const item of results) {
        map[item.modelId] = item;
      }
      setHealthMap(map);
      setLastCheckedAt(new Date().toISOString());
      setCheckError(null);
    } catch (e) {
      // console.error('[useModelHealth] check failed:', e);
      setCheckError((e instanceof Error ? e.message : '健康检查失败') || '健康检查失败');
    } finally {
      setIsChecking(false);
      checkingRef.current = false;
    }
  }, []);

  /** 切换自动刷新 */
  const toggleAutoRefresh = useCallback(() => {
    setAutoRefreshEnabled(prev => !prev);
  }, []);

  /** 自动定时刷新 */
  useEffect(() => {
    if (!autoRefreshEnabled) {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
      return;
    }

    // 只有当已有检测结果时才启动定时器
    if (Object.keys(healthMap).length === 0) return;

    autoRefreshTimerRef.current = setInterval(() => {
      if (lastModelsRef.current && lastModelsRef.current.length > 0) {
        checkHealth(lastModelsRef.current);
      }
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (autoRefreshTimerRef.current) {
        clearInterval(autoRefreshTimerRef.current);
        autoRefreshTimerRef.current = null;
      }
    };
  }, [autoRefreshEnabled, healthMap, checkHealth]);

  const getModelStatus = useCallback((modelId: string): HealthStatus => {
    const item = healthMap[modelId];
    if (!item) return 'unknown';
    return item.status;
  }, [healthMap]);

  const getStatusColor = useCallback((status: HealthStatus): string => {
    return STATUS_COLORS[status];
  }, []);

  const getStatusLabel = useCallback((status: HealthStatus): string => {
    return STATUS_LABELS[status];
  }, []);

  const getLatencyText = useCallback((modelId: string): string => {
    const item = healthMap[modelId];
    if (!item?.latency) return '';
    return `${item.latency}ms`;
  }, [healthMap]);

  return {
    healthMap,
    isChecking,
    lastCheckedAt,
    checkError,
    autoRefreshEnabled,
    checkHealth,
    toggleAutoRefresh,
    getModelStatus,
    getStatusColor,
    getStatusLabel,
    getLatencyText,
  };
}
