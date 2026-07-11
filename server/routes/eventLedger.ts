/**
 * Event Ledger Routes — 事件溯源查询路由
 *
 * 提供事件账本的查询 API，用于调试、审计和会话重建。
 */

import { Router } from 'express';
import { getEventLedger } from '../engine/eventLedger.js';
import { getEventPolicy } from '../engine/eventPolicy.js';
import { logger } from '../logger.js';

const router = Router();

/**
 * 依据事件策略（engine/eventPolicy）对查询出的事件做脱敏与过滤。
 * - 命中黑名单/保留策略不允许的事件将被剔除；
 * - 含敏感字段（api_key / token / secret / password 等）的 payload 将被脱敏。
 * 该函数为「死」模块 eventPolicy 接入实时事件查询路径，不改变既有查询语义。
 */
function applyEventPolicy(events: any[]): any[] {
  const policy = getEventPolicy();
  const out: any[] = [];
  for (const ev of events) {
    const type: string = ev?.type ?? ev?.eventType ?? '';
    const payload: Record<string, unknown> = ev?.payload ?? ev?.data ?? {};
    const verdict = policy.checkEvent(type, payload);
    if (!verdict.allowed) continue; // 按策略过滤（黑名单 / 保留策略）
    const redactedPayload = verdict.redacted ? policy.redactPayload(payload) : payload;
    out.push({
      ...ev,
      payload: redactedPayload,
    });
  }
  return out;
}

// 查询会话事件列表
router.get('/sessions/:sessionId/events', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const fromSeq = req.query.fromSeq ? parseInt(req.query.fromSeq as string) : undefined;
    const toSeq = req.query.toSeq ? parseInt(req.query.toSeq as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
    const reverse = req.query.reverse === 'true';
    const eventTypes = req.query.types
      ? (req.query.types as string).split(',') as any[]
      : undefined;

    const events = await getEventLedger().getSessionEvents(sessionId, {
      fromSeq,
      toSeq,
      limit,
      reverse,
      eventTypes,
    });

    const filtered = applyEventPolicy(events);

    res.json({
      ok: true,
      data: filtered,
      count: filtered.length,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 查询事件失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 重建会话（事件回放）
router.get('/sessions/:sessionId/reconstruct', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getEventLedger().reconstructSession(sessionId);

    if (!session) {
      res.status(404).json({
        ok: false,
        error: 'Session not found in event ledger',
      });
      return;
    }

    res.json({
      ok: true,
      data: session,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 重建会话失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 获会计话元信息
router.get('/sessions/:sessionId/meta', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const meta = await getEventLedger().getSessionMeta(sessionId);

    if (!meta) {
      res.status(404).json({
        ok: false,
        error: 'Session not found in event ledger',
      });
      return;
    }

    res.json({
      ok: true,
      data: meta,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 查询会话元信息失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 列出所有会话
router.get('/sessions', async (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
    const sortBy = (req.query.sortBy as string) || 'updated_at';

    const sessions = await getEventLedger().listSessions({
      status: status as any,
      limit,
      offset,
      sortBy: sortBy as any,
    });

    res.json({
      ok: true,
      data: sessions,
      count: sessions.length,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 列出会话失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 获取不完整的会话（崩溃检测）
router.get('/sessions/incomplete', async (_req, res) => {
  try {
    const sessions = await getEventLedger().findIncompleteSessions();

    res.json({
      ok: true,
      data: sessions,
      count: sessions.length,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 查询不完整会话失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 手动触发会话恢复
router.post('/sessions/:sessionId/recover', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await getEventLedger().recoverSession(sessionId);

    if (!session) {
      res.status(404).json({
        ok: false,
        error: 'Session not found in event ledger',
      });
      return;
    }

    res.json({
      ok: true,
      data: session,
      message: 'Session recovered successfully',
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 恢复会话失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 获取统计信息
router.get('/stats', async (_req, res) => {
  try {
    const stats = await getEventLedger().getStats();

    res.json({
      ok: true,
      data: {
        ...stats,
        dbSizeHuman: formatBytes(stats.dbSizeBytes),
      },
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 获取统计信息失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 手动记录事件（调试用）
router.post('/sessions/:sessionId/events', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { type, payload, runId, actor } = req.body;

    if (!type) {
      res.status(400).json({
        ok: false,
        error: 'Event type is required',
      });
      return;
    }

    // --- 事件策略（engine/eventPolicy）：过滤 + 脱敏 ---
    // 仅作用于事件账本的持久化，不影响聊天 SSE 路径。默认策略允许全部事件，
    // 仅对包含敏感字段名（api_key/secret/password/token 等）或敏感模式的 payload 做脱敏。
    const policy = getEventPolicy();
    const decision = policy.checkEvent(type, (payload as Record<string, unknown>) || {});
    if (!decision.allowed) {
      res.status(403).json({
        ok: false,
        error: `Event rejected by policy: ${decision.reason ?? 'not allowed'}`,
      });
      return;
    }
    const safePayload: Record<string, unknown> = decision.redacted
      ? policy.redactPayload((payload as Record<string, unknown>) || {})
      : (payload as Record<string, unknown>) || {};

    const event = await getEventLedger().recordEvent(sessionId, type as any, safePayload, {
      runId,
      actor,
    });

    res.json({
      ok: true,
      data: event,
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 记录事件失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// 清理旧会话
router.post('/prune', async (req, res) => {
  try {
    const maxSessions = req.body.maxSessions ? parseInt(req.body.maxSessions) : 200;
    const pruned = await getEventLedger().pruneOldSessions(maxSessions);

    res.json({
      ok: true,
      data: {
        prunedCount: pruned,
      },
    });
  } catch (err) {
    logger.error('[EventLedgerRoute] 清理旧会话失败:', err);
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

// ==================== 工具函数 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
