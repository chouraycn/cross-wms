/**
 * 路由命中率 API 客户端 — 调用 /api/staffdeck/route-metrics
 *
 * 复用 StaffDeck API client（已内置 envelope 解包 + auth header）。
 */

import { api } from '../components/staff/api/client';

// ===================== 类型 =====================

export interface RouteMetricsSnapshot {
  tenantId: string;
  agentId?: string;
  total: number;
  hit_binding: number;
  hit_explicit: number;
  miss_fallback: number;
  hitRate: number;
  hit_rate_pct?: number;
  lastMissAt: number;
  recentMissReasons: string[];
}

export interface AgentMetricsList {
  tenant_id: string;
  count: number;
  sort_by: string;
  items: RouteMetricsSnapshot[];
}

export interface GlobalMetrics {
  global: RouteMetricsSnapshot;
  tenants: RouteMetricsSnapshot[];
  tenant_count: number;
}

// ===================== API 函数 =====================

/** 获取当前租户汇总（或指定员工）的路由指标 */
export function getRouteMetrics(agentId?: string): Promise<RouteMetricsSnapshot> {
  const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : '';
  return api.get<RouteMetricsSnapshot>(`/route-metrics${qs}`);
}

/** 获取当前租户所有员工的命中率排行 */
export function listAgentMetrics(
  sortBy: 'total' | 'hitRate' | 'miss_fallback' | 'lastMissAt' = 'total',
  limit = 200,
): Promise<AgentMetricsList> {
  return api.get<AgentMetricsList>(
    `/route-metrics/agents?sort_by=${sortBy}&limit=${limit}`,
  );
}

/** 获取全局汇总（含所有租户），需要 admin 权限 */
export function getGlobalRouteMetrics(): Promise<GlobalMetrics> {
  return api.get<GlobalMetrics>('/route-metrics/global');
}

/** 清理过期的 recentMissReasons */
export function pruneRouteMetrics(olderThanMs: number): Promise<{ pruned: boolean; older_than_ms: number }> {
  return api.post('/route-metrics/prune', { older_than_ms: olderThanMs });
}
