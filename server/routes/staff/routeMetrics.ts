/**
 * H5: 路由命中率查询 API — 挂载 /api/staffdeck/route-metrics
 *
 * 端点：
 *   GET /              — 当前租户下汇总（?agent_id=xxx 可选：指定员工）
 *   GET /agents        — 当前租户所有员工的命中率排行（按 total 降序）
 *   GET /global        — 全局汇总（仅 owner/admin 可见；桌面宽松模式下不鉴）
 *   POST /prune        — 清理过期 recentMissReasons（body: { older_than_ms }）
 *
 * 所有响应统一使用 respond.ts envelope：{ code, data, message }
 */

import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import { ok, fail, BizCode, notFound } from '../_shared/respond.js';
import { staffAuth, getStaffContext, requireStaffAdmin } from '../../middleware/staffAuth.js';
import {
  getRouteMetrics,
  listTenantAgentMetrics,
  getGlobalRouteMetrics,
  pruneRouteMetrics,
  getTenantMetricsList,
} from '../../routeMetrics.js';

const router = Router();

function tenantOf(req: Request, res: Response): string {
  try {
    const ctx = getStaffContext(res);
    if (ctx?.tenantId) return ctx.tenantId;
  } catch {
    // noop: allow unauthenticated fallthrough in desktop mode
  }
  const q = req.query.tenant_id as string | undefined;
  const b = (req.body as any)?.tenant_id as string | undefined;
  return q || b || DEFAULT_TENANT_ID;
}

/** 把 snapshot 的 hitRate 格式化成百分比字段，便于前端展示 */
function withHitPct(snap: any) {
  return {
    ...snap,
    hit_rate_pct: snap && typeof snap.hitRate === 'number' ? Number((snap.hitRate * 100).toFixed(2)) : 0,
  };
}

// ========== GET / ==========
router.get('/', staffAuth, (req: Request, res: Response) => {
  const tenantId = tenantOf(req, res);
  const agentId = (req.query.agent_id as string | undefined)?.trim() || undefined;
  const snap = getRouteMetrics(tenantId, agentId);
  ok(res, withHitPct(snap), 'ok');
});

// ========== GET /agents ==========
router.get('/agents', staffAuth, (req: Request, res: Response) => {
  const tenantId = tenantOf(req, res);
  const limit = Number(req.query.limit) || 200;
  const sortBy = (req.query.sort_by as string) || 'total';
  let list = listTenantAgentMetrics(tenantId);
  const cmp: Record<string, (a: any, b: any) => number> = {
    total: (a, b) => b.total - a.total,
    hitRate: (a, b) => b.hitRate - a.hitRate,
    miss_fallback: (a, b) => b.miss_fallback - a.miss_fallback,
    lastMissAt: (a, b) => b.lastMissAt - a.lastMissAt,
  };
  const fn = cmp[sortBy] || cmp.total;
  list = list.sort(fn).slice(0, Math.max(1, Math.min(1000, limit)));
  ok(
    res,
    {
      tenant_id: tenantId,
      count: list.length,
      sort_by: sortBy,
      items: list.map(withHitPct),
    },
    'ok',
  );
});

// ========== GET /global ==========
router.get('/global', staffAuth, requireStaffAdmin, (_req: Request, res: Response) => {
  const globalSnap = getGlobalRouteMetrics();
  const perTenant = getTenantMetricsList();
  ok(
    res,
    {
      global: withHitPct(globalSnap),
      tenants: perTenant.map(withHitPct),
      tenant_count: perTenant.length,
    },
    'ok',
  );
});

// ========== POST /prune ==========
router.post('/prune', staffAuth, requireStaffAdmin, (req: Request, res: Response) => {
  const body = req.body ?? {};
  const olderThanMs = Number(body.older_than_ms);
  if (!Number.isFinite(olderThanMs) || olderThanMs <= 0) {
    fail(res, BizCode.VALIDATION, 'older_than_ms 必须为正整数毫秒', 422);
    return;
  }
  pruneRouteMetrics(olderThanMs);
  ok(res, { pruned: true, older_than_ms: olderThanMs }, 'ok');
});

export default router;
