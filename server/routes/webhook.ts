/**
 * Webhook 管理 REST API 路由
 *
 * 提供 Webhook 的 CRUD、测试和日志查询功能
 */

import { Router, type Request, type Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  getAllWebhooks,
  getWebhookById,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  getWebhookLogs,
  createWebhookLog,
  updateWebhookLog,
  getWebhookStats,
  type WebhookConfig,
  type WebhookLog,
} from '../dao/webhookDao.js';
import { logger } from '../logger.js';

const router = Router();

// ===================== GET /api/webhook - 获取所有 Webhook =====================

router.get('/', (_req: Request, res: Response) => {
  try {
    const webhooks = getAllWebhooks();
    res.json({ ok: true, webhooks });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 获取所有 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== GET /api/webhook/stats - 获取统计信息 =====================

router.get('/stats', (_req: Request, res: Response) => {
  try {
    const stats = getWebhookStats();
    res.json({ ok: true, stats });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 获取统计信息失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== GET /api/webhook/:id - 获取单个 Webhook =====================

router.get('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const webhook = getWebhookById(id);

    if (!webhook) {
      res.status(404).json({ ok: false, error: 'Webhook not found' });
      return;
    }

    res.json({ ok: true, webhook });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 获取单个 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== POST /api/webhook - 创建 Webhook =====================

router.post('/', (req: Request, res: Response) => {
  try {
    const { name, url, events, headers, enabled } = req.body;

    // 参数验证
    if (!name || typeof name !== 'string') {
      res.status(400).json({ ok: false, error: 'name is required and must be a string' });
      return;
    }

    if (!url || typeof url !== 'string') {
      res.status(400).json({ ok: false, error: 'url is required and must be a string' });
      return;
    }

    if (!events || !Array.isArray(events)) {
      res.status(400).json({ ok: false, error: 'events is required and must be an array' });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'enabled is required and must be a boolean' });
      return;
    }

    const webhook = createWebhook({
      name,
      url,
      events,
      headers: headers || {},
      enabled,
    });

    logger.info('[Webhook API] 创建 Webhook 成功:', webhook.id);
    res.json({ ok: true, webhook });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 创建 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== PUT /api/webhook/:id - 更新 Webhook =====================

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, url, events, headers, enabled } = req.body;

    // 检查 Webhook 是否存在
    const existing = getWebhookById(id);
    if (!existing) {
      res.status(404).json({ ok: false, error: 'Webhook not found' });
      return;
    }

    // 参数验证
    if (name !== undefined && typeof name !== 'string') {
      res.status(400).json({ ok: false, error: 'name must be a string' });
      return;
    }

    if (url !== undefined && typeof url !== 'string') {
      res.status(400).json({ ok: false, error: 'url must be a string' });
      return;
    }

    if (events !== undefined && !Array.isArray(events)) {
      res.status(400).json({ ok: false, error: 'events must be an array' });
      return;
    }

    if (headers !== undefined && typeof headers !== 'object') {
      res.status(400).json({ ok: false, error: 'headers must be an object' });
      return;
    }

    if (enabled !== undefined && typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'enabled must be a boolean' });
      return;
    }

    const webhook = updateWebhook(id, {
      name,
      url,
      events,
      headers,
      enabled,
    });

    logger.info('[Webhook API] 更新 Webhook 成功:', id);
    res.json({ ok: true, webhook });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 更新 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== DELETE /api/webhook/:id - 删除 Webhook =====================

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const success = deleteWebhook(id);
    if (!success) {
      res.status(404).json({ ok: false, error: 'Webhook not found' });
      return;
    }

    logger.info('[Webhook API] 删除 Webhook 成功:', id);
    res.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 删除 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== POST /api/webhook/:id/test - 测试 Webhook =====================

router.post('/:id/test', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { payload } = req.body;

    // 检查 Webhook 是否存在
    const webhook = getWebhookById(id);
    if (!webhook) {
      res.status(404).json({ ok: false, error: 'Webhook not found' });
      return;
    }

    // 创建日志记录
    const logId = uuidv4();
    const triggeredAt = new Date().toISOString();
    const requestBody = JSON.stringify(payload || { test: true, timestamp: triggeredAt });

    createWebhookLog({
      id: logId,
      webhookId: id,
      eventType: 'test',
      status: 'pending',
      triggeredAt,
      requestBody,
      retryCount: 0,
    });

    // 发送测试请求
    const startTime = Date.now();
    let responseStatus = 0;
    let responseBody = '';
    let errorMessage = '';

    try {
      // 构建请求头
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...webhook.headers,
      };

      // 发送 HTTP POST 请求
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      responseStatus = response.status;
      responseBody = await response.text();

      const duration = Date.now() - startTime;
      const completedAt = new Date().toISOString();
      const status = response.ok ? 'success' : 'failed';

      // 更新日志
      updateWebhookLog(logId, {
        status,
        completedAt,
        duration,
        statusCode: responseStatus,
        responseBody,
      });

      logger.info('[Webhook API] 测试 Webhook 成功:', id, 'Status:', responseStatus);

      res.json({
        ok: true,
        response: {
          status: responseStatus,
          body: responseBody,
        },
      });
    } catch (fetchErr: unknown) {
      const duration = Date.now() - startTime;
      const completedAt = new Date().toISOString();
      errorMessage = fetchErr instanceof Error ? fetchErr.message : 'Unknown error';

      // 更新日志为失败
      updateWebhookLog(logId, {
        status: 'failed',
        completedAt,
        duration,
        error: errorMessage,
      });

      logger.error('[Webhook API] 测试 Webhook 失败:', id, errorMessage);

      res.json({
        ok: false,
        error: errorMessage,
        response: {
          status: 0,
          body: errorMessage,
        },
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 测试 Webhook 失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

// ===================== GET /api/webhook/:id/logs - 获取执行日志 =====================

router.get('/:id/logs', (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const limit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
    const offset = typeof req.query.offset === 'string' ? parseInt(req.query.offset, 10) : 0;

    // 检查 Webhook 是否存在
    const webhook = getWebhookById(id);
    if (!webhook) {
      res.status(404).json({ ok: false, error: 'Webhook not found' });
      return;
    }

    const { logs, total } = getWebhookLogs(id, limit, offset);

    res.json({ ok: true, logs, total });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[Webhook API] 获取执行日志失败:', err);
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;