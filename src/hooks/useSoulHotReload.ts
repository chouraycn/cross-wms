/**
 * useSoulHotReload Hook — Soul 规则热更新监听器
 *
 * 功能：
 * 1. 监听 SSE 事件（规则文件变化）
 * 2. 自动刷新规则面板
 * 3. 显示更新提示
 *
 * 参考 useAgentChat.ts 和 useApprovalEvents.ts 的架构设计
 */

import { useState, useEffect, useCallback, useRef } from 'react';

// ===================== Types =====================

export type SoulEventType =
  | 'connected'
  | 'initial-state'
  | 'soul-changed'
  | 'user-changed'
  | 'error';

export interface SoulEvent {
  type: SoulEventType;
  fileType: 'soul' | 'user';
  timestamp: number;
  profile?: SoulProfile;
  error?: string;
}

export interface SoulProfile {
  identity: string;
  personality: 'cautious' | 'efficient' | 'balanced';
  tone: string[];
  values: string[];
  forbiddenZones: string[];
  strategy: StrategyPreferences;
  rawSoulContent: string;
  rawUserContent: string;
}

export interface StrategyPreferences {
  plannerThreshold: 'simple' | 'moderate' | 'complex';
  observerFastPath: boolean;
  maxTurnsMultiplier: number;
}

export interface SoulHotReloadState {
  /** 是否已连接 */
  isConnected: boolean;
  /** 当前 Soul 配置 */
  profile: SoulProfile | null;
  /** 最后更新时间 */
  lastUpdated: number | null;
  /** 是否有更新提示 */
  hasUpdate: boolean;
  /** 错误信息 */
  error: string | null;
  /** 事件计数 */
  eventCount: number;
}

// ===================== Hook =====================

export function useSoulHotReload(): SoulHotReloadState & {
  /** 重连 SSE */
  reconnect: () => void;
  /** 清除更新提示 */
  clearUpdate: () => void;
  /** 手动刷新配置 */
  refresh: () => Promise<void>;
} {
  const [state, setState] = useState<SoulHotReloadState>({
    isConnected: false,
    profile: null,
    lastUpdated: null,
    hasUpdate: false,
    error: null,
    eventCount: 0,
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);

  /**
   * 处理 SSE 事件
   */
  const handleEvent = useCallback((event: SoulEvent) => {
    setState(prev => {
      const newState: SoulHotReloadState = {
        ...prev,
        eventCount: prev.eventCount + 1,
        lastUpdated: event.timestamp,
      };

      switch (event.type) {
        case 'connected':
          newState.isConnected = true;
          newState.error = null;
          reconnectAttemptsRef.current = 0;
          break;

        case 'initial-state':
        case 'soul-changed':
        case 'user-changed':
          if (event.profile) {
            newState.profile = event.profile;
            newState.hasUpdate = true;
            newState.error = null;
          }
          break;

        case 'error':
          newState.error = event.error || '未知错误';
          newState.isConnected = false;
          break;
      }

      return newState;
    });
  }, []);

  /**
   * 初始化 SSE 连接
   */
  const initSSE = useCallback(() => {
    // 清理旧连接
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // 清理重连定时器
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    try {
      const eventSource = new EventSource('/api/soul/events');
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setState(prev => ({
          ...prev,
          isConnected: true,
          error: null,
        }));
        reconnectAttemptsRef.current = 0;
      };

      eventSource.onmessage = (e) => {
        try {
          const event: SoulEvent = JSON.parse(e.data);
          handleEvent(event);
        } catch (err) {
          console.error('[useSoulHotReload] Failed to parse SSE event:', err);
        }
      };

      eventSource.onerror = () => {
        setState(prev => ({
          ...prev,
          isConnected: false,
          error: 'SSE 连接失败',
        }));

        // 自动重连（指数退避）
        const maxAttempts = 5;
        const baseDelay = 1000;

        if (reconnectAttemptsRef.current < maxAttempts) {
          const delay = baseDelay * Math.pow(2, reconnectAttemptsRef.current);
          reconnectAttemptsRef.current++;

          reconnectTimerRef.current = setTimeout(() => {
            initSSE();
          }, delay);
        }
      };
    } catch (err) {
      console.error('[useSoulHotReload] Failed to create EventSource:', err);
      setState(prev => ({
        ...prev,
        error: '无法创建 SSE 连接',
      }));
    }
  }, [handleEvent]);

  /**
   * 重连 SSE
   */
  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    initSSE();
  }, [initSSE]);

  /**
   * 清除更新提示
   */
  const clearUpdate = useCallback(() => {
    setState(prev => ({
      ...prev,
      hasUpdate: false,
    }));
  }, []);

  /**
   * 手动刷新配置（调用 API）
   */
  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/soul/current');
      const data = await response.json();

      if (data.profile) {
        setState(prev => ({
          ...prev,
          profile: data.profile,
          lastUpdated: Date.now(),
          error: null,
        }));
      }
    } catch (err) {
      console.error('[useSoulHotReload] Failed to refresh profile:', err);
      setState(prev => ({
        ...prev,
        error: '刷新配置失败',
      }));
    }
  }, []);

  // 组件挂载时初始化 SSE
  useEffect(() => {
    initSSE();

    // 初始加载配置（备份策略，以防 SSE 未及时返回）
    refresh();

    // 组件卸载时清理
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [initSSE, refresh]);

  return {
    ...state,
    reconnect,
    clearUpdate,
    refresh,
  };
}

export default useSoulHotReload;