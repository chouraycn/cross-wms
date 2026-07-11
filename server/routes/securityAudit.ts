import { Router, type Request, type Response } from 'express';
import { logger } from '../logger.js';
import {
  runRuntimeSecurityAudit,
  type RuntimeAuditResult,
  type RuntimeAuditSuppression,
} from '../services/runtimeSecurityAudit.js';

const router = Router();

// 内存中缓存最近一次审计结果（审计为只读型，无需持久化）
let lastResult: RuntimeAuditResult | null = null;

/**
 * POST /api/security-audit/run
 * 执行运行时安全审计。Body 可选: { suppressions?: RuntimeAuditSuppression[] }
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const { suppressions } = (req.body ?? {}) as { suppressions?: RuntimeAuditSuppression[] };

    const result = await runRuntimeSecurityAudit(
      Array.isArray(suppressions) ? { suppressions } : undefined,
    );

    lastResult = result;

    res.json({ success: true, data: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[SecurityAuditRoute] 运行时安全审计失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/security-audit/last
 * 获取最近一次审计结果（如从未执行过则返回 null）
 */
router.get('/last', (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: lastResult });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[SecurityAuditRoute] 获取最近审计结果失败:', message);
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/security-audit/health
 * 轻量健康端点：报告是否曾执行过审计（便于监控集成）
 */
router.get('/health', (_req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: {
        hasLastRun: lastResult !== null,
        auditedAt: lastResult?.auditedAt ?? null,
        findingCount: lastResult?.findings.length ?? 0,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;
