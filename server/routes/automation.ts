import { Router, type Request, type Response } from 'express';
import { authenticateWebhook } from '../engine/webhook.js';
import { ensureEncryptionKey } from '../engine/crypto.js';
import { getAutomationById, createRun } from '../dao/automationDao.js';
import { emitAutomationEvent, AutomationEventType } from '../engine/eventBus.js';

const router = Router();

/**
 * POST /api/automation/webhook/:id
 * Webhook 触发的自动化执行
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

export default router;
