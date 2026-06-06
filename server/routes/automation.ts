import { Router, type Request, type Response } from 'express';
import { authenticateWebhook } from '../engine/webhook.js';
import { ensureEncryptionKey, encrypt, decrypt } from '../engine/crypto.js';
import {
  getAllAutomations,
  getAutomationById,
  createAutomation,
  updateAutomation,
  deleteAutomation,
  createRun,
  getRunsByAutomationId,
  findAutomationsByEvent,
} from '../dao/automationDao.js';
import { emitAutomationEvent, AutomationEventType } from '../engine/eventBus.js';
import { executeAndRecord } from '../engine/engine.js';

const router = Router();

// ===================== Automation CRUD =====================

/**
 * GET /api/automation
 * 获取所有自动化列表
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const automations = getAllAutomations();
    res.json({ data: automations, total: automations.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * GET /api/automation/:id
 * 获取单个自动化详情
 */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const automation = getAutomationById(req.params.id);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    res.json(automation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/automation
 * 创建自动化
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { name, prompt, taskType } = req.body;
    if (!name || !prompt || !taskType) {
      res.status(400).json({ error: 'name, prompt, taskType are required' });
      return;
    }

    const automation = createAutomation({
      name: String(name),
      description: req.body.description ?? '',
      status: req.body.status ?? 'ACTIVE',
      scheduleType: req.body.scheduleType ?? 'recurring',
      rrule: req.body.rrule ?? '',
      scheduledAt: req.body.scheduledAt ?? null,
      scheduleLabel: req.body.scheduleLabel ?? '',
      prompt: String(prompt),
      taskType: String(taskType),
      taskConfig: req.body.taskConfig ?? {},
      validFrom: req.body.validFrom ?? null,
      validUntil: req.body.validUntil ?? null,
      triggerType: req.body.triggerType ?? 'schedule',
      eventTrigger: req.body.eventTrigger ?? null,
      webhookConfig: req.body.webhookConfig ?? null,
      executionPolicy: req.body.executionPolicy ?? null,
      notificationConfig: req.body.notificationConfig ?? null,
    });

    res.status(201).json(automation);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/automation/:id
 * 更新自动化
 */
router.put('/:id', (req: Request, res: Response) => {
  try {
    const existing = getAutomationById(req.params.id);
    if (!existing) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }

    const allowedFields: Record<string, string> = {
      name: 'name',
      description: 'description',
      status: 'status',
      scheduleType: 'scheduleType',
      rrule: 'rrule',
      scheduledAt: 'scheduledAt',
      scheduleLabel: 'scheduleLabel',
      prompt: 'prompt',
      taskType: 'taskType',
      taskConfig: 'taskConfig',
      validFrom: 'validFrom',
      validUntil: 'validUntil',
      triggerType: 'triggerType',
      eventTrigger: 'eventTrigger',
      webhookConfig: 'webhookConfig',
      executionPolicy: 'executionPolicy',
      notificationConfig: 'notificationConfig',
      lastRunAt: 'lastRunAt',
      nextRunAt: 'nextRunAt',
      runCount: 'runCount',
    };

    const updateData: Record<string, unknown> = {};
    for (const [bodyKey, dataKey] of Object.entries(allowedFields)) {
      if (bodyKey in req.body && req.body[bodyKey] !== undefined) {
        updateData[dataKey] = req.body[bodyKey];
      }
    }

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: 'No valid fields to update' });
      return;
    }

    const updated = updateAutomation(req.params.id, updateData);
    if (!updated) {
      res.status(404).json({ error: 'Automation not found after update' });
      return;
    }

    res.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * DELETE /api/automation/:id
 * 删除自动化
 */
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const deleted = deleteAutomation(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    res.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Manual Trigger =====================

/**
 * POST /api/automation/:id/trigger
 * 手动触发自动化执行
 */
router.post('/:id/trigger', async (req: Request, res: Response) => {
  try {
    const automation = getAutomationById(req.params.id);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    if (automation.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Automation not active' });
      return;
    }

    // 异步执行，不等待
    const result = await executeAndRecord(automation, 'manual');

    if (!result) {
      res.status(409).json({ error: 'Automation is already running' });
      return;
    }

    res.json({ acknowledged: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Execution History =====================

/**
 * GET /api/automation/:id/executions
 * 获取自动化执行历史
 */
router.get('/:id/executions', (req: Request, res: Response) => {
  try {
    const automation = getAutomationById(req.params.id);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }

    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    const result = getRunsByAutomationId(req.params.id, limit, offset);
    res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Webhook Config =====================

/**
 * GET /api/automation/:id/webhook-config
 * 获取 Webhook 配置（不含明文密钥）
 */
router.get('/:id/webhook-config', (req: Request, res: Response) => {
  try {
    const automation = getAutomationById(req.params.id);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }

    const cfg = automation.webhookConfig as Record<string, unknown> | null;
    res.json({
      enabled: cfg?.enabled ?? false,
      hasSecret: !!cfg?.secretEncrypted,
      // 不返回 secretEncrypted 明文
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

/**
 * PUT /api/automation/:id/webhook-config
 * 更新 Webhook 密钥
 *
 * Body: { secret?: string } — 传空字符串或不传则禁用/清空
 */
router.put('/:id/webhook-config', (req: Request, res: Response) => {
  try {
    const automation = getAutomationById(req.params.id);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }

    const currentCfg = (automation.webhookConfig ?? {}) as Record<string, unknown>;
    const secret = typeof req.body.secret === 'string' ? req.body.secret : '';

    if (secret) {
      const key = ensureEncryptionKey();
      const encrypted = encrypt(secret, key);
      updateAutomation(req.params.id, {
        webhookConfig: { ...currentCfg, enabled: true, secretEncrypted: encrypted },
      });
    } else {
      // 禁用 webhook
      updateAutomation(req.params.id, {
        webhookConfig: { ...currentCfg, enabled: false, secretEncrypted: null },
      });
    }

    const updated = getAutomationById(req.params.id);
    res.json(updated?.webhookConfig ?? { enabled: false, hasSecret: false });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Webhook Trigger =====================

/**
 * POST /api/automation/webhook/:id
 * Webhook 触发的自动化执行（保持向后兼容）
 */
router.post('/webhook/:id', async (req: Request, res: Response) => {
  try {
    const automationId = req.params.id;
    const automation = getAutomationById(automationId);
    if (!automation) {
      res.status(404).json({ error: 'Automation not found' });
      return;
    }
    if (automation.status !== 'ACTIVE') {
      res.status(400).json({ error: 'Automation not active' });
      return;
    }

    // 提取 webhook 配置中的加密 secret
    const webhookConfig = (automation.webhookConfig ?? {}) as Record<string, unknown>;
    const secretEncrypted = webhookConfig.secretEncrypted as string | undefined;
    if (!secretEncrypted) {
      res.status(400).json({ error: 'Webhook secret not configured' });
      return;
    }

    // 验证签名
    const key = ensureEncryptionKey();
    const body = JSON.stringify(req.body);
    const signatureHeader = (req.headers['x-crosswms-signature'] as string) ?? '';

    const result = authenticateWebhook(signatureHeader, body, secretEncrypted, key);
    if (!result.valid) {
      res.status(401).json({ error: result.reason });
      return;
    }

    // 创建执行记录
    const now = new Date().toISOString();
    createRun({
      automationId,
      taskType: automation.taskType,
      status: 'running',
      startedAt: now,
      completedAt: null,
      duration: null,
      result: null,
      steps: [],
      isRetry: false,
      triggerSource: 'webhook',
      triggerDetail: { body: req.body },
      retryCount: 0,
    });

    // 发布 webhook received 事件
    emitAutomationEvent(AutomationEventType.WEBHOOK_RECEIVED, {
      automationId,
      taskType: automation.taskType,
      status: 'triggered',
      timestamp: now,
      data: { body: req.body },
    });

    res.json({ acknowledged: true, automationId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Global Execution History =====================

// NOTE: 此路由必须在 /:id 之前注册，避免 "executions" 被当成 :id 参数
router.get('/executions', (req: Request, res: Response) => {
  try {
    // 需要 DAO 支持全局查询，这里通过 runs 表直接查
    const { initDb } = require('../db.js');
    const db = initDb();
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 100;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    const countRow = db.prepare('SELECT COUNT(*) as total FROM automation_runs').get() as { total: number };
    const rows = db.prepare(
      'SELECT * FROM automation_runs ORDER BY started_at DESC LIMIT ? OFFSET ?'
    ).all(limit, offset);

    // 反序列化 JSON 字段
    const data = rows.map((row: Record<string, unknown>) => ({
      id: row.id,
      automationId: row.automation_id,
      taskType: row.task_type,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at,
      duration: row.duration,
      result: row.result,
      steps: row.steps ? (() => { try { return JSON.parse(row.steps as string); } catch { return []; } })() : [],
      isRetry: row.is_retry === 1,
      triggerSource: row.trigger_source,
      triggerDetail: row.trigger_detail ? (() => { try { return JSON.parse(row.trigger_detail as string); } catch { return null; } })() : null,
      retryCount: row.retry_count,
    }));

    res.json({ data, total: countRow.total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

// ===================== Available Events =====================

/**
 * GET /api/automation/events/list
 * 返回可用的事件列表（供前端事件触发配置使用）
 */
router.get('/events/list', (_req: Request, res: Response) => {
  res.json({
    events: [
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
    ],
  });
});

/**
 * POST /api/automation/events/trigger
 * 手动触发一个事件（调试/测试用）
 *
 * Body: { eventName: string, payload?: Record<string, unknown> }
 */
router.post('/events/trigger', async (req: Request, res: Response) => {
  try {
    const { eventName, payload } = req.body;
    if (!eventName) {
      res.status(400).json({ error: 'eventName is required' });
      return;
    }

    // 查找所有匹配该事件的自动化
    const automations = findAutomationsByEvent(String(eventName));
    if (automations.length === 0) {
      res.json({ triggered: 0, message: 'No matching automations found' });
      return;
    }

    // 异步触发每个匹配的自动化
    const results = await Promise.allSettled(
      automations.map((auto) => executeAndRecord(auto, 'event'))
    );

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;
    res.json({ triggered: automations.length, success: successCount, total: automations.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  }
});

export default router;
