/**
 * ToolPermissionContext — 全局工具权限请求管理
 *
 * v1.9.2: 管理敏感工具调用的用户确认流程。
 * 后端通过 SSE 发送 permission_request 事件，前端弹出确认弹窗。
 */

import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import type { ToolPermissionRequest } from '../components/CrossWmsChat/ToolPermissionDialog';

interface ToolPermissionContextValue {
  /** 当前待处理的权限请求 */
  pendingRequest: ToolPermissionRequest | null;
  /** 提交权限响应（允许/拒绝） */
  submitPermission: (reqId: string, approved: boolean) => void;
  /** 注册新的权限请求 */
  requestPermission: (req: ToolPermissionRequest) => void;
}

const ToolPermissionContext = createContext<ToolPermissionContextValue>({
  pendingRequest: null,
  submitPermission: () => {},
  requestPermission: () => {},
});

export const useToolPermission = () => useContext(ToolPermissionContext);

export const ToolPermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pendingRequest, setPendingRequest] = useState<ToolPermissionRequest | null>(null);
  const requestQueueRef = useRef<ToolPermissionRequest[]>([]);
  const processingRef = useRef(false);

  const processQueue = useCallback(() => {
    if (processingRef.current || requestQueueRef.current.length === 0) return;
    processingRef.current = true;
    const next = requestQueueRef.current.shift()!;
    setPendingRequest(next);
  }, []);

  const requestPermission = useCallback((req: ToolPermissionRequest) => {
    requestQueueRef.current.push(req);
    processQueue();
  }, [processQueue]);

  const submitPermission = useCallback((reqId: string, approved: boolean) => {
    // 发送响应到后端
    fetch('/api/permission-response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reqId, approved }),
    }).catch((e) => console.error('[ToolPermission] 发送权限响应失败:', e));

    // 处理下一个请求
    setPendingRequest(null);
    processingRef.current = false;
    setTimeout(() => processQueue(), 100);
  }, [processQueue]);

  return (
    <ToolPermissionContext.Provider value={{ pendingRequest, submitPermission, requestPermission }}>
      {children}
    </ToolPermissionContext.Provider>
  );
};
