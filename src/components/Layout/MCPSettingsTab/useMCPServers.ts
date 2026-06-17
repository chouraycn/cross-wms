/**
 * useMCPServers — MCP Server 状态管理 Hook
 *
 * 封装所有 MCP REST API 调用，提供状态 + 操作方法。
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  McpServerState,
  AddServerRequest,
  UpdateServerRequest,
  McpServersResponse,
  McpServerActionResponse,
} from './types';

const API_BASE = '/api/mcp';

/** Hook 返回值 */
interface UseMCPServersResult {
  /** 所有 Server 状态列表 */
  servers: McpServerState[];
  /** 是否正在加载 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
  /** 刷新列表 */
  refresh: () => Promise<void>;
  /** 添加 Server */
  addServer: (req: AddServerRequest) => Promise<McpServerActionResponse>;
  /** 更新 Server */
  updateServer: (id: string, req: UpdateServerRequest) => Promise<McpServerActionResponse>;
  /** 删除 Server */
  deleteServer: (id: string) => Promise<boolean>;
  /** 手动连接 */
  connectServer: (id: string) => Promise<McpServerActionResponse>;
  /** 手动断开 */
  disconnectServer: (id: string) => Promise<boolean>;
  /** 测试连接 */
  testServer: (id: string) => Promise<McpServerActionResponse>;
}

export function useMCPServers(): UseMCPServersResult {
  const [servers, setServers] = useState<McpServerState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 刷新列表
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/servers`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data: McpServersResponse = await res.json();
      setServers(data.servers);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  // 初次加载
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 添加 Server
  const addServer = useCallback(async (req: AddServerRequest): Promise<McpServerActionResponse> => {
    const res = await fetch(`${API_BASE}/servers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const data: McpServerActionResponse = await res.json();
    if (data.success && data.server) {
      // 合入本地状态
      setServers(prev => {
        const idx = prev.findIndex(s => s.config.id === data.server!.config.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = data.server!;
          return next;
        }
        return [...prev, data.server!];
      });
    }
    return data;
  }, []);

  // 更新 Server
  const updateServer = useCallback(async (id: string, req: UpdateServerRequest): Promise<McpServerActionResponse> => {
    const res = await fetch(`${API_BASE}/servers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const data: McpServerActionResponse = await res.json();
    if (data.success && data.server) {
      setServers(prev => prev.map(s => s.config.id === id ? data.server! : s));
    }
    return data;
  }, []);

  // 删除 Server
  const deleteServer = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/servers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setServers(prev => prev.filter(s => s.config.id !== id));
      return true;
    }
    return false;
  }, []);

  // 手动连接
  const connectServer = useCallback(async (id: string): Promise<McpServerActionResponse> => {
    const res = await fetch(`${API_BASE}/servers/${id}/connect`, { method: 'POST' });
    const data: McpServerActionResponse = await res.json();
    if (data.success && data.server) {
      setServers(prev => prev.map(s => s.config.id === id ? data.server! : s));
    }
    return data;
  }, []);

  // 手动断开
  const disconnectServer = useCallback(async (id: string): Promise<boolean> => {
    const res = await fetch(`${API_BASE}/servers/${id}/disconnect`, { method: 'POST' });
    if (res.ok) {
      setServers(prev => prev.map(s =>
        s.config.id === id
          ? { ...s, connectionState: 'disconnected' as const, tools: [], error: undefined, lastConnectedAt: undefined }
          : s
      ));
      return true;
    }
    return false;
  }, []);

  // 测试连接
  const testServer = useCallback(async (id: string): Promise<McpServerActionResponse> => {
    const res = await fetch(`${API_BASE}/servers/${id}/test`, { method: 'POST' });
    return await res.json();
  }, []);

  return {
    servers,
    loading,
    error,
    refresh,
    addServer,
    updateServer,
    deleteServer,
    connectServer,
    disconnectServer,
    testServer,
  };
}
