/**
 * useApprovalEvents Hook — 处理审批事件流
 *
 * 功能：
 * - 接收 SSE 流中的审批请求事件
 * - 处理审批超时
 * - 管理审批队列
 * - 支持批量审批
 * - 发送审批响应到后端
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApprovalRequest, ApprovalHistoryItem, ApprovalConfig } from '../components/CDFChat/ApprovalDialog.js';
import { API_BASE } from '../constants/api.js';

export interface ApprovalEventData {
  requestId: string;
  type: 'tool_call' | 'bash_command' | 'file_write' | 'file_delete' | 'network_request' | 'subprocess' | 'system_command';
  description: string;
  toolName?: string;
  command?: string;
  filePath?: string;
  details: Record<string, unknown>;
  riskLevel?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  reason?: string;
  timeout?: number;
  expiresAt?: number;
}

export interface ApprovalResponse {
  requestId: string;
  approved: boolean;
  pattern?: string;
  decidedBy?: string;
  reason?: string;
}

export interface UseApprovalEventsOptions {
  sessionId?: string;
  config?: ApprovalConfig;
  onApprovalRequest?: (request: ApprovalRequest) => void;
  onApprovalTimeout?: (requestId: string) => void;
  onApprovalHistoryUpdate?: (history: ApprovalHistoryItem[]) => void;
  enableSound?: boolean;
  enableVibration?: boolean;
}

export interface UseApprovalEventsResult {
  approvalRequests: ApprovalRequest[];
  approvalHistory: ApprovalHistoryItem[];
  approvalConfig: ApprovalConfig;
  handleApprove: (requestId: string) => Promise<void>;
  handleReject: (requestId: string) => Promise<void>;
  handleApproveAlways: (requestId: string, pattern?: string) => Promise<void>;
  handleApproveAll: () => Promise<void>;
  handleRejectAll: () => Promise<void>;
  handleTimeout: (requestId: string) => Promise<void>;
  addToWhitelist: (pattern: string) => void;
  removeFromWhitelist: (pattern: string) => void;
  updateConfig: (config: Partial<ApprovalConfig>) => void;
  clearRequests: () => void;
  clearHistory: () => void;
}

const DEFAULT_APPROVAL_TIMEOUT = 30000; // 30 秒

export function useApprovalEvents(options: UseApprovalEventsOptions = {}): UseApprovalEventsResult {
  const {
    sessionId,
    config = {},
    onApprovalRequest,
    onApprovalTimeout,
    onApprovalHistoryUpdate,
    enableSound = false,
    enableVibration = false,
  } = options;

  const [approvalRequests, setApprovalRequests] = useState<ApprovalRequest[]>([]);
  const [approvalHistory, setApprovalHistory] = useState<ApprovalHistoryItem[]>([]);
  const [approvalConfig, setApprovalConfig] = useState<ApprovalConfig>({
    securityMode: config.securityMode || 'standard',
    enableSound: enableSound,
    enableVibration: enableVibration,
    defaultTimeout: config.defaultTimeout || DEFAULT_APPROVAL_TIMEOUT,
    positionMode: config.positionMode || 'modal',
  });

  const timeoutTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);

  // 播放提示音
  const playNotificationSound = useCallback(() => {
    if (!approvalConfig.enableSound) return;

    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }

      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch (e) {
      // 静默失败
    }
  }, [approvalConfig.enableSound]);

  // 振动提示
  const triggerVibration = useCallback(() => {
    if (!approvalConfig.enableVibration) return;

    try {
      if ('vibrate' in navigator) {
        navigator.vibrate([100, 50, 100]);
      }
    } catch (e) {
      // 静默失败
    }
  }, [approvalConfig.enableVibration]);

  // 添加审批请求
  const addApprovalRequest = useCallback((eventData: ApprovalEventData) => {
    const request: ApprovalRequest = {
      id: eventData.requestId,
      toolName: eventData.toolName || eventData.type,
      toolDescription: eventData.description,
      parameters: eventData.details,
      riskLevel: eventData.riskLevel || determineRiskLevel(eventData),
      reason: eventData.reason,
      timestamp: Date.now(),
      command: eventData.command,
      timeout: eventData.timeout || approvalConfig.defaultTimeout || DEFAULT_APPROVAL_TIMEOUT,
      expiresAt: eventData.expiresAt || Date.now() + (eventData.timeout || approvalConfig.defaultTimeout || DEFAULT_APPROVAL_TIMEOUT),
      argv: eventData.command ? parseCommandArgs(eventData.command) : undefined,
    };

    setApprovalRequests(prev => [...prev, request]);

    // 设置超时定时器
    const timeout = request.timeout || DEFAULT_APPROVAL_TIMEOUT;
    const timer = setTimeout(() => {
      handleTimeout(request.id);
    }, timeout);

    timeoutTimersRef.current.set(request.id, timer);

    // 触发提示
    playNotificationSound();
    triggerVibration();

    // 调用回调
    onApprovalRequest?.(request);

    // 发送全局事件
    window.dispatchEvent(new CustomEvent('approval_request', { detail: request }));
  }, [approvalConfig.defaultTimeout, playNotificationSound, triggerVibration, onApprovalRequest]);

  // 根据事件数据确定风险等级
  const determineRiskLevel = (eventData: ApprovalEventData): 'safe' | 'low' | 'medium' | 'high' | 'critical' => {
    const type = eventData.type;
    const command = eventData.command || '';

    // 严重风险：危险命令
    if (command.includes('rm -rf /') || command.includes('mkfs') || command.includes('dd if=')) {
      return 'critical';
    }

    // 高风险：系统命令、sudo、文件删除
    if (type === 'system_command' || command.includes('sudo') || type === 'file_delete') {
      return 'high';
    }

    // 中风险：文件写入、网络请求、子进程
    if (type === 'file_write' || type === 'network_request' || type === 'subprocess' || type === 'bash_command') {
      return 'medium';
    }

    // 低风险：普通工具调用
    if (type === 'tool_call') {
      return 'low';
    }

    // 默认：安全
    return 'safe';
  };

  // 解析命令参数
  const parseCommandArgs = (command: string): string[] => {
    try {
      const parts = command.trim().split(/\s+/);
      return parts;
    } catch {
      return [command];
    }
  };

  // 发送审批响应到后端
  const sendApprovalResponse = useCallback(async (response: ApprovalResponse) => {
    try {
      const res = await fetch(`${API_BASE}/approval/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          ...response,
        }),
      });

      if (!res.ok) {
        throw new Error(`审批响应发送失败: ${res.status}`);
      }

      return await res.json();
    } catch (error) {
      console.error('[useApprovalEvents] 发送审批响应失败:', error);
      throw error;
    }
  }, [sessionId]);

  // 处理批准
  const handleApprove = useCallback(async (requestId: string) => {
    const request = approvalRequests.find(r => r.id === requestId);
    if (!request) return;

    // 清除超时定时器
    const timer = timeoutTimersRef.current.get(requestId);
    if (timer) {
      clearTimeout(timer);
      timeoutTimersRef.current.delete(requestId);
    }

    // 记录历史
    const historyItem: ApprovalHistoryItem = {
      id: requestId,
      toolName: request.toolName,
      command: request.command,
      decision: 'approved',
      timestamp: Date.now(),
    };

    setApprovalHistory(prev => {
      const newHistory = [...prev, historyItem];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    // 移除请求
    setApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    // 发送响应
    await sendApprovalResponse({
      requestId,
      approved: true,
    });
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate]);

  // 处理拒绝
  const handleReject = useCallback(async (requestId: string) => {
    const request = approvalRequests.find(r => r.id === requestId);
    if (!request) return;

    // 清除超时定时器
    const timer = timeoutTimersRef.current.get(requestId);
    if (timer) {
      clearTimeout(timer);
      timeoutTimersRef.current.delete(requestId);
    }

    // 记录历史
    const historyItem: ApprovalHistoryItem = {
      id: requestId,
      toolName: request.toolName,
      command: request.command,
      decision: 'rejected',
      timestamp: Date.now(),
    };

    setApprovalHistory(prev => {
      const newHistory = [...prev, historyItem];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    // 移除请求
    setApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    // 发送响应
    await sendApprovalResponse({
      requestId,
      approved: false,
    });

    // 调用回调
    onApprovalTimeout?.(requestId);
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate, onApprovalTimeout]);

  // 处理始终允许
  const handleApproveAlways = useCallback(async (requestId: string, pattern?: string) => {
    const request = approvalRequests.find(r => r.id === requestId);
    if (!request) return;

    const whitelistPattern = pattern || request.argv?.[0] || request.toolName;

    // 清除超时定时器
    const timer = timeoutTimersRef.current.get(requestId);
    if (timer) {
      clearTimeout(timer);
      timeoutTimersRef.current.delete(requestId);
    }

    // 添加到白名单
    addToWhitelist(whitelistPattern);

    // 记录历史
    const historyItem: ApprovalHistoryItem = {
      id: requestId,
      toolName: request.toolName,
      command: request.command,
      decision: 'approved-always',
      timestamp: Date.now(),
      reason: `白名单模式: ${whitelistPattern}`,
    };

    setApprovalHistory(prev => {
      const newHistory = [...prev, historyItem];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    // 移除请求
    setApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    // 发送响应
    await sendApprovalResponse({
      requestId,
      approved: true,
      pattern: whitelistPattern,
    });
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate]);

  // 处理超时
  const handleTimeout = useCallback(async (requestId: string) => {
    const request = approvalRequests.find(r => r.id === requestId);
    if (!request) return;

    // 清除定时器
    const timer = timeoutTimersRef.current.get(requestId);
    if (timer) {
      clearTimeout(timer);
      timeoutTimersRef.current.delete(requestId);
    }

    // 记录历史（超时自动拒绝）
    const historyItem: ApprovalHistoryItem = {
      id: requestId,
      toolName: request.toolName,
      command: request.command,
      decision: 'rejected',
      timestamp: Date.now(),
      reason: '超时自动拒绝',
    };

    setApprovalHistory(prev => {
      const newHistory = [...prev, historyItem];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    // 移除请求
    setApprovalRequests(prev => prev.filter(r => r.id !== requestId));

    // 发送拒绝响应
    await sendApprovalResponse({
      requestId,
      approved: false,
      reason: 'timeout',
    });

    // 调用回调
    onApprovalTimeout?.(requestId);

    // 发送全局事件
    window.dispatchEvent(new CustomEvent('approval_timeout', { detail: { requestId, request } }));
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate, onApprovalTimeout]);

  // 批量批准
  const handleApproveAll = useCallback(async () => {
    const historyItems: ApprovalHistoryItem[] = approvalRequests.map(r => ({
      id: r.id,
      toolName: r.toolName,
      command: r.command,
      decision: 'approved',
      timestamp: Date.now(),
    }));

    // 清除所有定时器
    approvalRequests.forEach(r => {
      const timer = timeoutTimersRef.current.get(r.id);
      if (timer) {
        clearTimeout(timer);
        timeoutTimersRef.current.delete(r.id);
      }
    });

    // 发送所有响应
    await Promise.all(
      approvalRequests.map(r =>
        sendApprovalResponse({
          requestId: r.id,
          approved: true,
        })
      )
    );

    setApprovalHistory(prev => {
      const newHistory = [...prev, ...historyItems];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    setApprovalRequests([]);
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate]);

  // 批量拒绝
  const handleRejectAll = useCallback(async () => {
    const historyItems: ApprovalHistoryItem[] = approvalRequests.map(r => ({
      id: r.id,
      toolName: r.toolName,
      command: r.command,
      decision: 'rejected',
      timestamp: Date.now(),
    }));

    // 清除所有定时器
    approvalRequests.forEach(r => {
      const timer = timeoutTimersRef.current.get(r.id);
      if (timer) {
        clearTimeout(timer);
        timeoutTimersRef.current.delete(r.id);
      }
    });

    // 发送所有响应
    await Promise.all(
      approvalRequests.map(r =>
        sendApprovalResponse({
          requestId: r.id,
          approved: false,
        })
      )
    );

    setApprovalHistory(prev => {
      const newHistory = [...prev, ...historyItems];
      onApprovalHistoryUpdate?.(newHistory);
      return newHistory;
    });

    setApprovalRequests([]);
  }, [approvalRequests, sendApprovalResponse, onApprovalHistoryUpdate]);

  // 添加到白名单
  const addToWhitelist = useCallback((pattern: string) => {
    // 这里可以调用白名单管理 API
    console.log('[useApprovalEvents] 添加到白名单:', pattern);

    // 发送全局事件
    window.dispatchEvent(new CustomEvent('whitelist_add', { detail: { pattern } }));
  }, []);

  // 从白名单移除
  const removeFromWhitelist = useCallback((pattern: string) => {
    console.log('[useApprovalEvents] 从白名单移除:', pattern);

    // 发送全局事件
    window.dispatchEvent(new CustomEvent('whitelist_remove', { detail: { pattern } }));
  }, []);

  // 更新配置
  const updateConfig = useCallback((newConfig: Partial<ApprovalConfig>) => {
    setApprovalConfig(prev => ({
      ...prev,
      ...newConfig,
    }));
  }, []);

  // 清除请求
  const clearRequests = useCallback(() => {
    // 清除所有定时器
    timeoutTimersRef.current.forEach(timer => clearTimeout(timer));
    timeoutTimersRef.current.clear();

    setApprovalRequests([]);
  }, []);

  // 清除历史
  const clearHistory = useCallback(() => {
    setApprovalHistory([]);
  }, []);

  // 监听审批请求事件（从 SSE 流）
  useEffect(() => {
    const handleApprovalEvent = (event: CustomEvent<ApprovalEventData>) => {
      addApprovalRequest(event.detail);
    };

    window.addEventListener('approval_event', handleApprovalEvent as EventListener);

    return () => {
      window.removeEventListener('approval_event', handleApprovalEvent as EventListener);
    };
  }, [addApprovalRequest]);

  // 清理定时器
  useEffect(() => {
    return () => {
      timeoutTimersRef.current.forEach(timer => clearTimeout(timer));
      timeoutTimersRef.current.clear();
    };
  }, []);

  return {
    approvalRequests,
    approvalHistory,
    approvalConfig,
    handleApprove,
    handleReject,
    handleApproveAlways,
    handleApproveAll,
    handleRejectAll,
    handleTimeout,
    addToWhitelist,
    removeFromWhitelist,
    updateConfig,
    clearRequests,
    clearHistory,
  };
}