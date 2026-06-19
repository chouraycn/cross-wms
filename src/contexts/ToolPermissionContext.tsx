/**
 * ToolPermissionContext — 全局工具权限请求管理
 *
 * v2.5.0: 支持批量权限请求。
 * - 多个工具请求一次性入队，前端一次性展示批量审批面板
 * - 用户可"全部允许"或逐个勾选
 * - 会话级免确认模式（trustMode）
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ToolPermissionRequest } from '../components/CrossWmsChat/ToolPermissionDialog';

interface ToolPermissionContextValue {
  /** 当前待处理的权限请求列表（批量） */
  pendingRequests: ToolPermissionRequest[];
  /** 提交权限响应（允许/拒绝） */
  submitPermission: (reqId: string, approved: boolean, alwaysAllow?: boolean) => void;
  /** 注册新的权限请求（单个） */
  requestPermission: (req: ToolPermissionRequest) => void;
  /** 注册批量权限请求 */
  requestPermissions: (reqs: ToolPermissionRequest[]) => void;
  /** 批量审批：全部允许 */
  approveAll: (alwaysAllow?: boolean) => void;
  /** 批量审批：全部拒绝 */
  denyAll: () => void;
  /** 会话级免确认模式 */
  trustMode: boolean;
  /** 切换免确认模式 */
  toggleTrustMode: () => void;
}

const ToolPermissionContext = createContext<ToolPermissionContextValue>({
  pendingRequests: [],
  submitPermission: () => {},
  requestPermission: () => {},
  requestPermissions: () => {},
  approveAll: () => {},
  denyAll: () => {},
  trustMode: false,
  toggleTrustMode: () => {},
});

export const useToolPermission = () => useContext(ToolPermissionContext);

export const ToolPermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequests, setPendingRequests] = useState<ToolPermissionRequest[]>([]);
  const [trustMode, setTrustMode] = useState(false);
  const requestQueueRef = useRef<ToolPermissionRequest[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (processingRef.current || requestQueueRef.current.length === 0) return;
    processingRef.current = true;
    // 批量取出队列中所有请求
    const batch = requestQueueRef.current.splice(0);
    setPendingRequests(prev => [...prev, ...batch]);
  }, []);

  const requestPermission = useCallback((req: ToolPermissionRequest) => {
    // v2.5.0: 免确认模式直接自动通过
    if (trustMode) {
      fetch('/api/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.reqId, approved: true }),
      }).catch(() => {});
      return;
    }
    requestQueueRef.current.push(req);
    processQueue();
  }, [trustMode, processQueue]);

  const requestPermissions = useCallback((reqs: ToolPermissionRequest[]) => {
    if (trustMode) {
      // 免确认模式：批量自动通过
      for (const req of reqs) {
        fetch('/api/permission-response', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reqId: req.reqId, approved: true }),
        }).catch(() => {});
      }
      return;
    }
    requestQueueRef.current.push(...reqs);
    processQueue();
  }, [trustMode, processQueue]);

  const submitPermission = useCallback((reqId: string, approved: boolean, alwaysAllow?: boolean) => {
    const body: Record<string, unknown> = { reqId, approved };
    if (alwaysAllow) {
      body.alwaysAllow = true;
    }
    fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((_e) => { /* silent: permission response send failure */ });

    // 从待处理列表中移除
    setPendingRequests(prev => prev.filter(r => r.reqId !== reqId));

    // 如果列表清空，允许下一个批次进入
    setPendingRequests(prev => {
      if (prev.length === 0) {
        processingRef.current = false;
        setTimeout(() => processQueue(), 50);
      }
      return prev;
    });
  }, [processQueue]);

  const approveAll = useCallback((alwaysAllow?: boolean) => {
    const current = [...pendingRequests];
    for (const req of current) {
      const body: Record<string, unknown> = { reqId: req.reqId, approved: true };
      if (alwaysAllow) {
        body.alwaysAllow = true;
      }
      fetch('/api/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }).catch(() => {});
    }
    setPendingRequests([]);
    processingRef.current = false;
    setTimeout(() => processQueue(), 50);
  }, [pendingRequests, processQueue]);

  const denyAll = useCallback(() => {
    const current = [...pendingRequests];
    for (const req of current) {
      fetch('/api/permission-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqId: req.reqId, approved: false }),
      }).catch(() => {});
    }
    setPendingRequests([]);
    processingRef.current = false;
    setTimeout(() => processQueue(), 50);
  }, [pendingRequests, processQueue]);

  const toggleTrustMode = useCallback(() => {
    setTrustMode(prev => !prev);
  }, []);

  return (
    <ToolPermissionContext.Provider value={{
      pendingRequests,
      submitPermission,
      requestPermission,
      requestPermissions,
      approveAll,
      denyAll,
      trustMode,
      toggleTrustMode,
    }}>
      {children}
    </ToolPermissionContext.Provider>
  );
};
