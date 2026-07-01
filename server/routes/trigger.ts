/**
 * Trigger Routes
 * 触发器 API 路由 - 提供触发器的 CRUD 和控制接口
 */

import { Router, type Request, type Response } from 'express';
import type { Trigger, TriggerType } from '../../src/services/automation/types.js';
import { getTriggerManager } from '../engine/triggerManager.js';
import { getTriggerEngine } from '../engine/triggerEngine.js';
import { getEventListener } from '../engine/eventListener.js';

const router = Router();

// ===================== Trigger CRUD =====================

/**
 * GET /api/triggers
 * 获取触发器列表
 */
router.get('/', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();

    const type = req.query.type as TriggerType | undefined;
    const enabled = req.query.enabled === 'true' ? true : req.query.enabled === 'false' ? false : undefined;
    const automationId = req.query.automationId as string | undefined;

    const triggers = manager.listTriggers({ type, enabled, automationId });
    res.json({ data: triggers, total: triggers.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/triggers/:id
 * 获取单个触发器详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const trigger = manager.getTrigger(req.params.id);

    if (!trigger) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    res.json(trigger);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/triggers
 * 创建触发器
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, type, automationIds, config, enabled } = req.body;

    if (!name || !type || !automationIds || !config) {
      res.status(400).json({ error: 'name, type, automationIds, config are required' });
      return;
    }

    if (!Array.isArray(automationIds) || automationIds.length === 0) {
      res.status(400).json({ error: 'automationIds must be a non-empty array' });
      return;
    }

    const validTypes: TriggerType[] = ['schedule', 'event', 'webhook', 'file_change', 'threshold'];
    if (!validTypes.includes(type as TriggerType)) {
      res.status(400).json({ error: `Invalid trigger type: ${type}` });
      return;
    }

    const manager = getTriggerManager();
    const trigger = manager.registerTrigger({
      name: String(name),
      type: type as TriggerType,
      automationIds: automationIds as string[],
      config: config as Trigger['config'],
      enabled: enabled ?? true,
    });

    res.status(201).json(trigger);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/triggers/:id
 * 更新触发器
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const existing = manager.getTrigger(req.params.id);

    if (!existing) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    const allowedFields: Record<string, string> = {
      name: 'name',
      automationIds: 'automationIds',
      config: 'config',
      enabled: 'enabled',
    };

    const updates: Partial<Trigger> = {};
    for (const [bodyKey, triggerKey] of Object.entries(allowedFields)) {
      if (bodyKey in req.body && req.body[bodyKey] !== undefined) {
        (updates as Record<string, unknown>)[triggerKey] = req.body[bodyKey];
      }
    }

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = manager.updateTrigger(req.params.id, updates);
    if (!updated) {
      res.status(404).json({ error: 'Trigger not found after update' });
      return;
    }

    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/triggers/:id
 * 删除触发器
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const deleted = manager.unregisterTrigger(req.params.id);

    if (!deleted) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Trigger Control =====================

/**
 * POST /api/triggers/:id/enable
 * 启用触发器
 */
router.post('/:id/enable', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const enabled = manager.enableTrigger(req.params.id);

    if (!enabled) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    res.json({ success: true, message: 'Trigger enabled' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/triggers/:id/disable
 * 禁用触发器
 */
router.post('/:id/disable', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const disabled = manager.disableTrigger(req.params.id);

    if (!disabled) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    res.json({ success: true, message: 'Trigger disabled' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/triggers/:id/trigger
 * 手动触发触发器（测试）
 */
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    const engine = getTriggerEngine();
    const trigger = engine.getTrigger(req.params.id);

    if (!trigger) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    if (!trigger.enabled) {
      res.status(400).json({ error: 'Trigger is disabled' });
      return;
    }

    // 手动触发所有关联的自动化
    const results = await Promise.allSettled(
      trigger.automationIds.map(async automationId => {
        return engine.fireTrigger(trigger.id, automationId, trigger.type as TriggerType, req.body.payload);
      })
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && (r.value as { success: boolean }).success).length;
    const failedCount = results.length - successCount;

    res.json({
      triggered: results.length,
      success: successCount,
      failed: failedCount,
      results: results.map(r => r.status === 'fulfilled' ? r.value : { error: (r as PromiseRejectedResult).reason }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Trigger Stats =====================

/**
 * GET /api/triggers/:id/stats
 * 获取触发器统计信息
 */
router.get('/:id/stats', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const stats = manager.getTriggerStats(req.params.id);

    if (!stats) {
      res.status(404).json({ error: 'Trigger stats not found' });
      return;
    }

    res.json(stats);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Trigger Type Helpers =====================

/**
 * GET /api/triggers/types
 * 获取可用的触发器类型列表
 */
router.get('/types', (_req: Request, res: Response) => {
  res.json({
    types: [
      { type: 'schedule', label: '定时触发', desc: '使用 cron 表达式定时触发' },
      { type: 'event', label: '事件触发', desc: '监听系统事件触发' },
      { type: 'webhook', label: 'Webhook 触发', desc: '外部 HTTP 请求触发' },
      { type: 'file_change', label: '文件变化触发', desc: '监听文件修改触发' },
      { type: 'threshold', label: '阈值触发', desc: '监控指标超过阈值触发' },
    ],
  });
});

/**
 * GET /api/triggers/events/list
 * 获取可监听的系统事件列表
 */
router.get('/events/list', (_req: Request, res: Response) => {
  res.json({
    events: [
      { eventName: 'chat_message', label: '聊天消息' },
      { eventName: 'tool_call', label: '工具调用' },
      { eventName: 'approval_decision', label: '审批决策' },
      { eventName: 'session_created', label: '会话创建' },
      { eventName: 'session_archived', label: '会话归档' },
      { eventName: 'warehouse.created', label: '仓库创建' },
      { eventName: 'warehouse.updated', label: '仓库更新' },
      { eventName: 'warehouse.deleted', label: '仓库删除' },
      { eventName: 'inventory.created', label: '库存新增' },
      { eventName: 'inventory.updated', label: '库存更新' },
      { eventName: 'inventory.deleted', label: '库存删除' },
      { eventName: 'inventory.low_stock', label: '库存不足预警' },
      { eventName: 'inbound.created', label: '入库单创建' },
      { eventName: 'inbound.completed', label: '入库完成' },
      { eventName: 'outbound.created', label: '出库单创建' },
      { eventName: 'outbound.completed', label: '出库完成' },
      { eventName: 'transit.created', label: '在途单创建' },
      { eventName: 'transit.arrived', label: '在途到达' },
      { eventName: 'volume.threshold_exceeded', label: '容积率超阈值' },
      { eventName: 'report.scheduled', label: '报表生成定时' },
      { eventName: 'automation.started', label: '自动化启动' },
      { eventName: 'automation.completed', label: '自动化完成' },
      { eventName: 'automation.failed', label: '自动化失败' },
    ],
  });
});

/**
 * GET /api/triggers/metrics/list
 * 获取可监控的指标列表
 */
router.get('/metrics/list', (_req: Request, res: Response) => {
  res.json({
    metrics: [
      { metric: 'warehouse_count', label: '仓库总数', unit: '个' },
      { metric: 'inventory_total', label: '库存总数', unit: '件' },
      { metric: 'inventory_low_stock_count', label: '低库存数量', unit: '件' },
      { metric: 'inbound_pending_count', label: '待入库数量', unit: '件' },
      { metric: 'outbound_pending_count', label: '待出库数量', unit: '件' },
      { metric: 'transit_in_progress_count', label: '在途数量', unit: '件' },
      { metric: 'volume_utilization_avg', label: '平均容积率', unit: '%' },
      { metric: 'volume_utilization_max', label: '最大容积率', unit: '%' },
      { metric: 'automation_success_rate', label: '自动化成功率', unit: '%' },
      { metric: 'automation_running_count', label: '正在运行的自动化数', unit: '个' },
    ],
  });
});

/**
 * GET /api/triggers/metrics/:metric/value
 * 获取指标当前值
 */
router.get('/metrics/:metric/value', async (req: Request, res: Response) => {
  try {
    const eventListener = getEventListener();
    const value = await eventListener.getMetricValue(req.params.metric);

    if (value === null) {
      res.status(404).json({ error: 'Metric value not available' });
      return;
    }

    res.json({ metric: req.params.metric, value, timestamp: Date.now() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Event Test =====================

/**
 * POST /api/triggers/events/test
 * 测试事件触发
 */
router.post('/events/test', (req: Request, res: Response) => {
  try {
    const { eventName, payload } = req.body;

    if (!eventName) {
      res.status(400).json({ error: 'eventName is required' });
      return;
    }

    const eventListener = getEventListener();
    eventListener.emitSystemEvent(eventName, payload || {});

    res.json({ success: true, eventName, payload });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Webhook Info =====================

/**
 * GET /api/triggers/:id/webhook-url
 * 获取 Webhook URL（用于 webhook 类型触发器）
 */
router.get('/:id/webhook-url', (req: Request, res: Response) => {
  try {
    const manager = getTriggerManager();
    const trigger = manager.getTrigger(req.params.id);

    if (!trigger) {
      res.status(404).json({ error: 'Trigger not found' });
      return;
    }

    if (trigger.type !== 'webhook') {
      res.status(400).json({ error: 'Trigger is not webhook type' });
      return;
    }

    // 生成 Webhook URL
    const webhookPath = trigger.config.webhookPath || `/api/triggers/webhook/${trigger.id}`;
    const baseUrl = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`;

    res.json({
      webhookUrl: `${baseUrl}${webhookPath}`,
      triggerId: trigger.id,
      enabled: trigger.enabled,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;