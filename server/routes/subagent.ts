/**
 * Subagent routes — REST API for 子代理管理
 *
 * POST /api/subagent/spawn              — 创建/启动子代理
 * GET  /api/subagent                    — 列出子代理（?status=&definitionId=&parentSessionKey= 可选过滤）
 * GET  /api/subagent/:id                — 获取子代理状态
 * POST /api/subagent/:id/cancel         — 取消子代理
 * GET  /api/subagent/:id/metrics        — 获取子代理指标
 * GET  /api/subagent/:id/announcements — 获取子代理公告历史
 *
 * 数据访问通过 engine/subagent/ barrel 文件调用，
 * 注册表实例来自 subagentRegistry，指标与公告来自对应的增强模块。
 */

import { Router } from 'express';
import { logger } from '../logger.js';
import {
  spawnSubagent,
  cancelSubagent,
  getSubagentRegistry,
  collectSessionMetrics,
  createSpawnAnnouncement,
  createStartAnnouncement,
  createCompletionAnnouncement,
  createFailureAnnouncement,
  createCancellationAnnouncement,
  calculateDuration,
  getInstanceAge,
  getLastActivityTime,
} from '../engine/subagent/index.js';
import type {
  SubagentStatus,
  SpawnSubagentParams,
  SubagentAnnouncement,
  SessionMetrics,
} from '../engine/subagent/index.js';

const router = Router();

/** POST /api/subagent/spawn — 创建/启动子代理 */
router.post('/spawn', async (req, res) => {
  try {
    const {
      definitionId,
      taskDescription,
      sessionKey,
      parentSessionKey,
      input,
      metadata,
      timeoutMs,
    } = req.body ?? {};

    if (!definitionId) {
      return res.status(400).json({ error: 'definitionId 不能为空' });
    }
    if (!taskDescription) {
      return res.status(400).json({ error: 'taskDescription 不能为空' });
    }
    if (!sessionKey) {
      return res.status(400).json({ error: 'sessionKey 不能为空' });
    }

    const params: SpawnSubagentParams = {
      definitionId,
      taskDescription,
      sessionKey,
      ...(parentSessionKey !== undefined && { parentSessionKey }),
      ...(input !== undefined && { input }),
      ...(metadata !== undefined && { metadata }),
      ...(timeoutMs !== undefined && { timeoutMs }),
    };

    const result = await spawnSubagent(params);
    res.json({ data: result });
  } catch (err) {
    logger.error('[Subagent API] 创建子代理失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/subagent — 列出子代理 */
router.get('/', (req, res) => {
  try {
    const status = req.query.status as SubagentStatus | undefined;
    const definitionId = req.query.definitionId as string | undefined;
    const parentSessionKey = req.query.parentSessionKey as string | undefined;

    const registry = getSubagentRegistry();
    const instances = registry.listInstances({
      ...(status !== undefined && { status }),
      ...(definitionId !== undefined && { definitionId }),
      ...(parentSessionKey !== undefined && { parentSessionKey }),
    });
    res.json({ data: instances });
  } catch (err) {
    logger.error('[Subagent API] 列出子代理失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/subagent/:id — 获取子代理状态 */
router.get('/:id', (req, res) => {
  try {
    const registry = getSubagentRegistry();
    const instance = registry.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: '子代理不存在' });
    }
    res.json({ data: instance });
  } catch (err) {
    logger.error('[Subagent API] 获取子代理状态失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/subagent/:id/cancel — 取消子代理 */
router.post('/:id/cancel', (req, res) => {
  try {
    const ok = cancelSubagent(req.params.id);
    if (!ok) {
      return res.status(404).json({ error: '子代理不存在或已终止' });
    }
    res.json({ data: { success: true } });
  } catch (err) {
    logger.error('[Subagent API] 取消子代理失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/subagent/:id/metrics — 获取子代理指标 */
router.get('/:id/metrics', (req, res) => {
  try {
    const id = req.params.id;

    // 优先从状态管理层收集指标（覆盖活跃 + 持久化实例）
    let metrics: SessionMetrics | null = collectSessionMetrics(id);

    if (!metrics) {
      // 回退：从注册表实例计算基础指标
      const registry = getSubagentRegistry();
      const instance = registry.getInstance(id);
      if (!instance) {
        return res.status(404).json({ error: '子代理不存在' });
      }

      const duration = calculateDuration(instance);
      const ageMs = getInstanceAge(instance);
      const lastActivity = getLastActivityTime(instance);
      const idleMs =
        instance.status === 'running' || instance.status === 'paused'
          ? Date.now() - lastActivity
          : undefined;

      metrics = {
        instanceId: instance.id,
        definitionId: instance.definitionId,
        status: instance.status,
        spawnedAt: instance.spawnedAt,
        startedAt: instance.startedAt,
        completedAt: instance.completedAt,
        lastActivityAt: instance.lastActivityAt,
        durationMs: duration,
        ageMs,
        idleMs,
        taskDescription: instance.taskDescription,
        hasResult: instance.result !== undefined && instance.result !== null,
        hasError: instance.error !== undefined && instance.error !== null,
      };
    }

    res.json({ data: metrics });
  } catch (err) {
    logger.error('[Subagent API] 获取子代理指标失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

/** GET /api/subagent/:id/announcements — 获取子代理公告历史 */
router.get('/:id/announcements', (req, res) => {
  try {
    const registry = getSubagentRegistry();
    const instance = registry.getInstance(req.params.id);
    if (!instance) {
      return res.status(404).json({ error: '子代理不存在' });
    }

    // 基于实例生命周期时间戳重建公告历史
    // 公告系统本身不存储历史记录，此处按生命周期事件重建
    const announcements: SubagentAnnouncement[] = [];

    // 生成阶段
    announcements.push({
      ...createSpawnAnnouncement(instance),
      timestamp: instance.spawnedAt,
    });

    // 启动阶段
    if (instance.startedAt) {
      announcements.push({
        ...createStartAnnouncement(instance),
        timestamp: instance.startedAt,
      });
    }

    // 终止阶段
    if (instance.completedAt) {
      switch (instance.status) {
        case 'completed':
          announcements.push({
            ...createCompletionAnnouncement(instance),
            timestamp: instance.completedAt,
          });
          break;
        case 'failed':
          announcements.push({
            ...createFailureAnnouncement(instance),
            timestamp: instance.completedAt,
          });
          break;
        case 'cancelled':
          announcements.push({
            ...createCancellationAnnouncement(instance),
            timestamp: instance.completedAt,
          });
          break;
      }
    }

    res.json({ data: announcements });
  } catch (err) {
    logger.error('[Subagent API] 获取子代理公告历史失败:', err);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
