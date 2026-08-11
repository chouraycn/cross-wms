/**
 * Route Metrics —— 路由命中率监控（员工绑定 vs 显式 vs CDF Auto Model）
 *
 * 提供：
 *  - per-tenant/per-agent 的命中/失败计数器
 *  - 冷启动 fallback 告警（新员工无绑定或绑定配置为空时路由失败，回落到 Auto Model）
 *  - 命中率查询接口（供 status CLI / 前端状态页使用）
 *
 * 注意：目前为内存计数器，进程重启后清零。如需持久化，后续再落库到
 * sd_agent_usages 或独立表。
 */

import { logger } from './logger.js';

// ===================== 类型 =====================

export type RouteDecisionSource = 'explicit' | 'binding' | 'auto';

/** 路由结果命中分类：
 *  - hit_binding   命中员工绑定（路由成功）
 *  - hit_explicit  命中显式选择（路由成功）
 *  - miss_fallback 路由未命中（无绑定 / 绑定配置为空），回落 Auto Model
 */
export type RouteHitKind = 'hit_binding' | 'hit_explicit' | 'miss_fallback';

export interface RouteMetricsSnapshot {
  tenantId: string;
  agentId?: string;
  /** 总路由次数 */
  total: number;
  hit_binding: number;
  hit_explicit: number;
  miss_fallback: number;
  /** 命中率 0~1（= (hit_binding + hit_explicit) / total） */
  hitRate: number;
  /** 上次路由失败时间戳（毫秒，0 表示无） */
  lastMissAt: number;
  /** 最近 10 次失败原因（FIFO） */
  recentMissReasons: string[];
}

interface AgentCounter {
  total: number;
  hit_binding: number;
  hit_explicit: number;
  miss_fallback: number;
  lastMissAt: number;
  recentMissReasons: string[]; // 只保留 N 条
}

// ===================== 全局状态 =====================

const MAX_RECENT_MISS = 10;

// 两级 Map：tenantId → (agentId → counter)；special agentId='*' 为租户汇总
const tenantCounters = new Map<string, Map<string, AgentCounter>>();
// 全局汇总
const globalCounter: AgentCounter = {
  total: 0,
  hit_binding: 0,
  hit_explicit: 0,
  miss_fallback: 0,
  lastMissAt: 0,
  recentMissReasons: [],
};

function getOrCreate(tenantId: string, agentId?: string): AgentCounter {
  let agents = tenantCounters.get(tenantId);
  if (!agents) {
    agents = new Map<string, AgentCounter>();
    tenantCounters.set(tenantId, agents);
  }
  const key = agentId ?? '*';
  let c = agents.get(key);
  if (!c) {
    c = { total: 0, hit_binding: 0, hit_explicit: 0, miss_fallback: 0, lastMissAt: 0, recentMissReasons: [] };
    agents.set(key, c);
  }
  return c;
}

function addRecent(arr: string[], reason: string): void {
  arr.push(reason);
  if (arr.length > MAX_RECENT_MISS) arr.splice(0, arr.length - MAX_RECENT_MISS);
}

function snapshot(counter: AgentCounter, tenantId: string, agentId?: string): RouteMetricsSnapshot {
  const total = counter.total;
  return {
    tenantId,
    agentId,
    total,
    hit_binding: counter.hit_binding,
    hit_explicit: counter.hit_explicit,
    miss_fallback: counter.miss_fallback,
    hitRate: total > 0 ? (counter.hit_binding + counter.hit_explicit) / total : 0,
    lastMissAt: counter.lastMissAt,
    recentMissReasons: [...counter.recentMissReasons],
  };
}

// ===================== 外部 API =====================

/** 记录一次路由命中结果 */
export function recordRouteDecision(
  tenantId: string,
  agentId: string,
  source: RouteDecisionSource,
  hitKind: RouteHitKind,
  reason?: string,
): void {
  if (!tenantId || !agentId) return;
  const tCounter = getOrCreate(tenantId);
  const aCounter = getOrCreate(tenantId, agentId);
  tCounter.total++;
  aCounter.total++;
  globalCounter.total++;

  const inc = (c: AgentCounter) => {
    switch (hitKind) {
      case 'hit_binding':
        c.hit_binding++;
        break;
      case 'hit_explicit':
        c.hit_explicit++;
        break;
      case 'miss_fallback':
        c.miss_fallback++;
        c.lastMissAt = Date.now();
        if (reason) addRecent(c.recentMissReasons, reason);
        break;
    }
  };
  inc(tCounter);
  inc(aCounter);
  inc(globalCounter);

  // 冷启动 fallback 告警（miss_fallback 时以 warn 级别打结构化日志）
  if (hitKind === 'miss_fallback') {
    const tSnap = snapshot(tCounter, tenantId);
    const rate = (tSnap.hitRate * 100).toFixed(1);
    logger.warn(
      `[RouteMetrics] 路由降级告警 tenant=${tenantId} agent=${agentId} source=${source} → fallback Auto Model。租户命中率=${rate}% 原因=${reason ?? ''}`,
      { tenantId, agentId, source, reason, hitRate: tSnap.hitRate, miss_fallback: tSnap.miss_fallback },
    );
  }
}

/** 获取指定员工的路由指标快照（不传 agentId 返回租户汇总） */
export function getRouteMetrics(tenantId: string, agentId?: string): RouteMetricsSnapshot {
  const c = getOrCreate(tenantId, agentId);
  return snapshot(c, tenantId, agentId);
}

/** 全局指标快照 */
export function getGlobalRouteMetrics(): RouteMetricsSnapshot {
  return snapshot(globalCounter, '__global__');
}

/** 按租户枚举所有员工的快照（仅返回已有计数记录的员工） */
export function listTenantAgentMetrics(tenantId: string): RouteMetricsSnapshot[] {
  const agents = tenantCounters.get(tenantId);
  if (!agents) return [];
  const out: RouteMetricsSnapshot[] = [];
  for (const [agentId, c] of agents) {
    if (agentId === '*') continue;
    out.push(snapshot(c, tenantId, agentId));
  }
  return out;
}

/** 枚举所有租户的汇总快照（agentId 为空；用于 H5 global 端点） */
export function getTenantMetricsList(): RouteMetricsSnapshot[] {
  const out: RouteMetricsSnapshot[] = [];
  for (const [tenantId, agents] of tenantCounters) {
    const c = agents.get('*');
    if (!c) continue;
    out.push(snapshot(c, tenantId));
  }
  return out;
}

/** 清理过期数据（保留有计数的 agent，只清 recentMissReasons 超过阈值） */
export function pruneRouteMetrics(olderThanMs: number): void {
  const threshold = Date.now() - olderThanMs;
  const pruneCounter = (c: AgentCounter) => {
    if (c.lastMissAt && c.lastMissAt < threshold) {
      c.recentMissReasons = [];
    }
  };
  for (const agents of tenantCounters.values()) {
    for (const c of agents.values()) pruneCounter(c);
  }
  pruneCounter(globalCounter);
}

/** 重置指标（仅用于测试） */
export function __resetRouteMetricsForTest(): void {
  tenantCounters.clear();
  globalCounter.total = 0;
  globalCounter.hit_binding = 0;
  globalCounter.hit_explicit = 0;
  globalCounter.miss_fallback = 0;
  globalCounter.lastMissAt = 0;
  globalCounter.recentMissReasons = [];
}
