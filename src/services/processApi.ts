/**
 * Process API — 前端调用后端 /api/process 端点
 *
 * 暴露的接口：
 * - listProcesses        列出所有托管进程
 * - getProcess           获取单个进程详情
 * - restartProcess       重启进程
 * - stopProcess          停止进程
 * - getProcessHealth     健康检查状态（含历史）
 * - getProcessResources  资源使用情况（CPU/内存，含历史）
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

/** 进程生命周期状态 */
export type ProcessState =
  | 'pending'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exited'
  | 'crashed'
  | 'zombie';

/** 健康状态 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/** 资源使用快照 */
export interface ResourceUsage {
  pid: number;
  timestamp: number;
  cpuPercent: number;
  memoryMb: number;
  rssBytes: number;
  heapUsedBytes?: number;
  heapTotalBytes?: number;
  handles?: number;
}

/** 进程监控快照 */
export interface ProcessSnapshot {
  id: string;
  pid?: number;
  name: string;
  state: ProcessState;
  startedAtMs: number;
  lastOutputAtMs: number;
  restartCount: number;
  uptimeMs: number;
  usage?: ResourceUsage;
  health?: HealthStatus;
  /** 命令行（演示字段） */
  command: string;
  /** 命令行参数（演示字段） */
  args: string[];
  /** 工作目录（演示字段） */
  cwd?: string;
}

/** 健康检查结果 */
export interface HealthCheckResult {
  name: string;
  status: HealthStatus;
  message?: string;
  durationMs: number;
  timestamp: number;
}

/** 健康检查响应 */
export interface ProcessHealthResponse {
  status: HealthStatus;
  history: HealthCheckResult[];
}

/** 资源使用响应 */
export interface ProcessResourcesResponse {
  current?: ResourceUsage;
  history: ResourceUsage[];
}

// ===================== API 函数 =====================

/** 列出所有托管进程 */
export async function listProcesses(): Promise<ProcessSnapshot[]> {
  const res = await request<{ processes: ProcessSnapshot[] }>('/api/process/list');
  return res.processes;
}

/** 获取单个进程详情 */
export async function getProcess(id: string): Promise<ProcessSnapshot> {
  const res = await request<{ process: ProcessSnapshot }>(
    `/api/process/${encodeURIComponent(id)}`,
  );
  return res.process;
}

/** 重启进程 */
export async function restartProcess(id: string): Promise<ProcessSnapshot> {
  const res = await request<{ process: ProcessSnapshot }>(
    `/api/process/${encodeURIComponent(id)}/restart`,
    { method: 'POST' },
  );
  return res.process;
}

/** 停止进程 */
export async function stopProcess(id: string): Promise<ProcessSnapshot> {
  const res = await request<{ process: ProcessSnapshot }>(
    `/api/process/${encodeURIComponent(id)}/stop`,
    { method: 'POST' },
  );
  return res.process;
}

/** 健康检查状态（含历史） */
export async function getProcessHealth(id: string): Promise<ProcessHealthResponse> {
  return request<ProcessHealthResponse>(
    `/api/process/${encodeURIComponent(id)}/health`,
  );
}

/** 资源使用情况（CPU/内存，含历史） */
export async function getProcessResources(id: string): Promise<ProcessResourcesResponse> {
  return request<ProcessResourcesResponse>(
    `/api/process/${encodeURIComponent(id)}/resources`,
  );
}
