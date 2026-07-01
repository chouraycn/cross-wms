/**
 * 目标管理 REST API
 *
 * 提供：
 * - GET    /api/goals/:sessionKey       — 获取会话目标
 * - POST   /api/goals/:sessionKey       — 创建会话目标
 * - PUT    /api/goals/:sessionKey       — 更新目标状态
 * - DELETE /api/goals/:sessionKey       — 清除会话目标
 * - GET    /api/goals/stats             — 获取目标统计
 */

import { Router } from 'express';
import {
  createGoal,
  getGoal,
  updateGoalStatus,
  clearGoal,
  initGoalTables,
} from '../engine/goalStore.js';
import { getDb } from '../db-core.js';
import type { GoalStatus } from '../engine/goalTypes.js';

const router = Router();

try {
  initGoalTables(getDb());
} catch (e) {
  // 表可能已存在，忽略
}

/**
 * GET /api/goals/stats
 * 获取目标统计信息
 */
router.get('/stats', (_req, res) => {
  try {
    const db = getDb();
    const total = (db.prepare('SELECT COUNT(*) as count FROM goal').get() as { count: number }).count;
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM goal GROUP BY status').all() as { status: string; count: number }[];

    const stats = {
      total,
      byStatus: byStatus.reduce((acc, item) => {
        acc[item.status as GoalStatus] = item.count;
        return acc;
      }, {} as Record<string, number>),
    };

    res.json({ data: stats });
  } catch (e) {
    res.status(500).json({
      error: `获取统计失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/goals/:sessionKey
 * 获取会话目标
 */
router.get('/:sessionKey', (req, res) => {
  try {
    const { sessionKey } = req.params;

    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey 不能为空' });
    }

    const snapshot = getGoal({ sessionKey });
    res.json({ data: snapshot });
  } catch (e) {
    res.status(500).json({
      error: `获取目标失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/goals/:sessionKey
 * 创建会话目标
 */
router.post('/:sessionKey', (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { objective, tokenBudget } = req.body;

    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey 不能为空' });
    }

    if (!objective || typeof objective !== 'string') {
      return res.status(400).json({ error: 'objective 不能为空' });
    }

    const goal = createGoal({
      sessionKey,
      objective,
      tokenBudget: tokenBudget ? Number(tokenBudget) : undefined,
    });

    res.json({
      data: {
        status: 'created',
        goal,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `创建目标失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * PUT /api/goals/:sessionKey
 * 更新目标状态
 */
router.put('/:sessionKey', (req, res) => {
  try {
    const { sessionKey } = req.params;
    const { status, note } = req.body;

    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey 不能为空' });
    }

    if (!status || typeof status !== 'string') {
      return res.status(400).json({ error: 'status 不能为空' });
    }

    const validStatuses: GoalStatus[] = ['pending', 'in_progress', 'complete', 'blocked', 'cancelled'];
    if (!validStatuses.includes(status as GoalStatus)) {
      return res.status(400).json({
        error: `无效的 status: ${status}，有效值: ${validStatuses.join(', ')}`,
      });
    }

    const goal = updateGoalStatus({
      sessionKey,
      status: status as GoalStatus,
      note,
    });

    res.json({
      data: {
        status: 'updated',
        goal,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `更新目标失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * DELETE /api/goals/:sessionKey
 * 清除会话目标
 */
router.delete('/:sessionKey', (req, res) => {
  try {
    const { sessionKey } = req.params;

    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey 不能为空' });
    }

    const success = clearGoal({ sessionKey });

    res.json({
      data: {
        success,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: `清除目标失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

export default router;
