/**
 * 执行历史 API — 查询、统计、删除执行记录
 */

import { Router, type Request, type Response } from 'express';
import {
  getExecutionHistory,
  getExecutionRecordById,
  getExecutionHistoryStats,
  deleteExecutionRecord,
  purgeExecutionHistory,
  type ExecutionHistoryFilter,
} from '../engine/executionHistory.js';

const router = Router();

// ===================== 执行历史列表 =====================

/**
 * GET /api/execution-history
 * 获取执行历史列表（支持分页和过滤）
 *
 * Query params:
 * - limit: 每页条数（默认 50）
 * - offset: 偏移量（默认 0）
 * - status: 状态过滤（running | success | failed | cancelled）
 * - type: 类型过滤（workflow | trigger | manual）
 * - startTimeFrom: 开始时间范围起点（毫秒）
 * - startTimeTo: 开始时间范围终点（毫秒）
 * - workflowId: 工作流 ID
 * - triggerId: 触发器 ID
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    const filter: ExecutionHistoryFilter = {};

    if (req.query.status && ['running', 'success', 'failed', 'cancelled'].includes(req.query.status as string)) {
      filter.status = req.query.status as ExecutionHistoryFilter['status'];
    }
    if (req.query.type && ['workflow', 'trigger', 'manual'].includes(req.query.type as string)) {
      filter.type = req.query.type as ExecutionHistoryFilter['type'];
    }
    if (req.query.startTimeFrom) {
      filter.startTimeFrom = parseInt(req.query.startTimeFrom as string, 10);
    }
    if (req.query.startTimeTo) {
      filter.startTimeTo = parseInt(req.query.startTimeTo as string, 10);
    }
    if (req.query.workflowId) {
      filter.workflowId = req.query.workflowId as string;
    }
    if (req.query.triggerId) {
      filter.triggerId = req.query.triggerId as string;
    }

    const result = getExecutionHistory(limit, offset, filter);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 统计信息 =====================

/**
 * GET /api/execution-history/stats
 * 获取执行历史统计信息
 *
 * Query params: 同 GET /api/execution-history 的过滤参数
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const filter: ExecutionHistoryFilter = {};

    if (req.query.status && ['running', 'success', 'failed', 'cancelled'].includes(req.query.status as string)) {
      filter.status = req.query.status as ExecutionHistoryFilter['status'];
    }
    if (req.query.type && ['workflow', 'trigger', 'manual'].includes(req.query.type as string)) {
      filter.type = req.query.type as ExecutionHistoryFilter['type'];
    }
    if (req.query.startTimeFrom) {
      filter.startTimeFrom = parseInt(req.query.startTimeFrom as string, 10);
    }
    if (req.query.startTimeTo) {
      filter.startTimeTo = parseInt(req.query.startTimeTo as string, 10);
    }

    const stats = getExecutionHistoryStats(filter);
    res.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 单条详情 =====================

/**
 * GET /api/execution-history/:id
 * 获取单条执行记录详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const record = getExecutionRecordById(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Execution record not found' });
      return;
    }
    res.json(record);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 删除操作 =====================

/**
 * DELETE /api/execution-history/:id
 * 删除单条执行记录
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteExecutionRecord(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Execution record not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== 批量清理 =====================

/**
 * DELETE /api/execution-history/purge
 * 清理执行历史
 *
 * Query params:
 * - beforeTime: 清理此时间之前的记录（毫秒）
 * - keepLatest: 保留最新的 N 条记录
 */
router.delete('/purge', (req: Request, res: Response) => {
  try {
    const options: { beforeTime?: number; keepLatest?: number } = {};

    if (req.query.beforeTime) {
      options.beforeTime = parseInt(req.query.beforeTime as string, 10);
    }
    if (req.query.keepLatest) {
      options.keepLatest = parseInt(req.query.keepLatest as string, 10);
    }

    const deletedCount = purgeExecutionHistory(options);
    res.json({ success: true, deleted: deletedCount });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;