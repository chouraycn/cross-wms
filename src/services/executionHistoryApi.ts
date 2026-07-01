/**
 * 执行历史 API — 前端调用后端执行历史接口
 */

import { request } from './api';

// ===================== Types =====================

export interface ExecutionNode {
  nodeId: string;
  nodeName: string;
  status: 'success' | 'failed' | 'skipped';
  startTime: number;
  endTime: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
}

export interface ExecutionRecord {
  id: string;
  workflowId?: string;
  triggerId?: string;
  type: 'workflow' | 'trigger' | 'manual';
  status: 'running' | 'success' | 'failed' | 'cancelled';
  startTime: number;
  endTime?: number;
  duration?: number;
  nodes?: ExecutionNode[];
  error?: string;
  output?: Record<string, unknown>;
}

export interface ExecutionHistoryFilter {
  status?: 'running' | 'success' | 'failed' | 'cancelled';
  type?: 'workflow' | 'trigger' | 'manual';
  startTimeFrom?: number;
  startTimeTo?: number;
  workflowId?: string;
  triggerId?: string;
}

export interface ExecutionHistoryStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  avgDuration: number;
  successRate: number;
}

export interface ExecutionHistoryListResponse {
  data: ExecutionRecord[];
  total: number;
}

// ===================== API Functions =====================

/**
 * 获取执行历史列表（支持分页和过滤）
 */
export async function getExecutionHistory(
  limit: number = 50,
  offset: number = 0,
  filter?: ExecutionHistoryFilter,
): Promise<ExecutionHistoryListResponse> {
  const params = new URLSearchParams();
  params.append('limit', String(limit));
  params.append('offset', String(offset));

  if (filter?.status) params.append('status', filter.status);
  if (filter?.type) params.append('type', filter.type);
  if (filter?.startTimeFrom) params.append('startTimeFrom', String(filter.startTimeFrom));
  if (filter?.startTimeTo) params.append('startTimeTo', String(filter.startTimeTo));
  if (filter?.workflowId) params.append('workflowId', filter.workflowId);
  if (filter?.triggerId) params.append('triggerId', filter.triggerId);

  const queryString = params.toString();
  const path = queryString ? `/api/execution-history?${queryString}` : `/api/execution-history`;

  return request<ExecutionHistoryListResponse>('GET', path);
}

/**
 * 获取单条执行记录详情
 */
export async function getExecutionRecordById(id: string): Promise<ExecutionRecord> {
  return request<ExecutionRecord>('GET', `/api/execution-history/${id}`);
}

/**
 * 获取执行历史统计信息
 */
export async function getExecutionHistoryStats(filter?: ExecutionHistoryFilter): Promise<ExecutionHistoryStats> {
  const params = new URLSearchParams();

  if (filter?.status) params.append('status', filter.status);
  if (filter?.type) params.append('type', filter.type);
  if (filter?.startTimeFrom) params.append('startTimeFrom', String(filter.startTimeFrom));
  if (filter?.startTimeTo) params.append('startTimeTo', String(filter.startTimeTo));

  const queryString = params.toString();
  const path = queryString ? `/api/execution-history/stats?${queryString}` : `/api/execution-history/stats`;

  return request<ExecutionHistoryStats>('GET', path);
}

/**
 * 删除单条执行记录
 */
export async function deleteExecutionRecord(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('DELETE', `/api/execution-history/${id}`);
}

/**
 * 清理执行历史
 */
export async function purgeExecutionHistory(options?: {
  beforeTime?: number;
  keepLatest?: number;
}): Promise<{ success: boolean; deleted: number }> {
  const params = new URLSearchParams();

  if (options?.beforeTime) params.append('beforeTime', String(options.beforeTime));
  if (options?.keepLatest) params.append('keepLatest', String(options.keepLatest));

  const queryString = params.toString();
  const path = queryString ? `/api/execution-history/purge?${queryString}` : `/api/execution-history/purge`;

  return request<{ success: boolean; deleted: number }>('DELETE', path);
}