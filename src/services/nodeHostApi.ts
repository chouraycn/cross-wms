/**
 * Node Host API — 前端调用后端 /api/node-host 端点
 *
 * 暴露的接口：
 * - getNodeHostInfo        获取节点主机信息
 * - getNodeHostTools       获取已注册工具列表
 * - invokeNodeHostTool     调用工具
 * - getNodeHostQueue       获取调用队列状态
 * - getNodeHostResources   获取资源监控
 *
 * 失败时抛 Error，前端组件可捕获并展示。
 */

import { API_BASE_URL } from '../constants/api';

const BASE_URL = API_BASE_URL;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ===================== 类型定义 =====================

/** 节点主机信息 */
export interface NodeHostInfo {
  nodeId: string;
  hostname: string;
  version: string;
  startedAtMs: number;
  uptimeMs: number;
  pid: number;
  platform: string;
  nodeVersion: string;
  capabilities: string[];
}

/** 工具状态 */
export type ToolStatus = 'active' | 'disabled' | 'error';

/** 已注册工具 */
export interface NodeHostTool {
  name: string;
  description: string;
  category?: string;
  version?: string;
  status: ToolStatus;
  invokeCount: number;
  averageDurationMs: number;
  permissions?: string[];
  inputSchema?: Record<string, unknown>;
}

/** 工具调用参数 */
export interface NodeHostToolInvokeParams {
  input: Record<string, unknown>;
}

/** 工具调用结果 */
export interface NodeHostToolInvokeResult {
  invocationId: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error?: string;
}

/** 调用队列状态 */
export interface NodeHostQueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
  averageDurationMs: number;
}

/** 资源快照 */
export interface NodeHostResourceSnapshot {
  timestamp: number;
  memoryBytes: number;
  cpuPercent: number;
  uptimeMs: number;
}

/** 资源监控响应 */
export interface NodeHostResources {
  current?: NodeHostResourceSnapshot;
  history: NodeHostResourceSnapshot[];
  limits: { maxMemoryMB: number; maxCpuPercent: number };
}

// ===================== API 函数 =====================

/** 获取节点主机信息 */
export async function getNodeHostInfo(): Promise<NodeHostInfo> {
  return request<NodeHostInfo>('/api/node-host/info');
}

/** 获取已注册工具列表 */
export async function getNodeHostTools(): Promise<NodeHostTool[]> {
  const res = await request<{ tools: NodeHostTool[] }>('/api/node-host/tools');
  return res.tools;
}

/** 调用工具 */
export async function invokeNodeHostTool(
  name: string,
  params: NodeHostToolInvokeParams,
): Promise<NodeHostToolInvokeResult> {
  return request<NodeHostToolInvokeResult>(
    `/api/node-host/tools/${encodeURIComponent(name)}/invoke`,
    {
      method: 'POST',
      body: JSON.stringify(params),
    },
  );
}

/** 获取调用队列状态 */
export async function getNodeHostQueue(): Promise<NodeHostQueueStats> {
  return request<NodeHostQueueStats>('/api/node-host/queue');
}

/** 获取资源监控 */
export async function getNodeHostResources(): Promise<NodeHostResources> {
  return request<NodeHostResources>('/api/node-host/resources');
}
