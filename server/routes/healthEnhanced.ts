/**
 * 健康检查路由增强版
 *
 * 提供：
 * 1. 系统总体健康状态
 * 2. 各渠道健康状态
 * 3. 配置状态
 * 4. SSE 流实时推送
 */

import { Router } from 'express';
import { channelHealthMonitor } from '../services/channelHealthMonitor.js';
import { configHotReload } from '../services/configHotReload.js';
import { API_PREFIX } from '../apiVersion.js';

const router = Router();

/**
 * GET /health
 * 基础健康检查（兼容原有端点）
 */
router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
  });
});

/**
 * GET /health/detailed
 * 详细健康状态
 */
router.get('/detailed', (_req, res) => {
  const channelHealth = channelHealthMonitor.getAllHealth();
  const systemHealth = channelHealthMonitor.getSystemHealth();
  const configEntries = configHotReload.getAllEntries();

  res.json({
    time: new Date().toISOString(),
    version: process.env.APP_VERSION || '1.0.0',
    system: {
      status: systemHealth.status,
      unhealthyChannels: systemHealth.unhealthyChannels,
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        unit: 'MB',
      },
      nodeVersion: process.version,
    },
    channels: channelHealth.map(ch => ({
      type: ch.type,
      status: ch.status,
      enabled: ch.config.enabled,
      lastCheck: ch.lastCheck ? new Date(ch.lastCheck).toISOString() : null,
      lastSuccess: ch.lastSuccess ? new Date(ch.lastSuccess).toISOString() : null,
      lastFailure: ch.lastFailure ? new Date(ch.lastFailure).toISOString() : null,
      consecutiveFailures: ch.consecutiveFailures,
      totalChecks: ch.totalChecks,
      totalFailures: ch.totalFailures,
      avgLatency: ch.avgLatency,
      lastError: ch.lastError,
    })),
    config: {
      watchedFiles: configEntries.length,
      files: configEntries.map(e => ({
        key: e.key,
        source: e.source,
        lastModified: new Date(e.lastModified).toISOString(),
        version: e.version,
      })),
    },
  });
});

/**
 * GET /health/channels
 * 渠道健康状态
 */
router.get('/channels', (_req, res) => {
  const channels = channelHealthMonitor.getAllHealth();

  res.json({
    time: new Date().toISOString(),
    channels: channels.map(ch => ({
      type: ch.type,
      status: ch.status,
      enabled: ch.config.enabled,
      lastCheck: ch.lastCheck,
      consecutiveFailures: ch.consecutiveFailures,
      lastError: ch.lastError,
    })),
  });
});

/**
 * GET /health/channels/:type
 * 单个渠道健康状态
 */
router.get('/channels/:type', (req, res) => {
  const { type } = req.params as { type: string };
  const health = channelHealthMonitor.getHealth(type as 'webhook' | 'wechat' | 'dingtalk');

  if (!health) {
    res.status(404).json({ error: 'Channel not found' });
    return;
  }

  res.json({
    time: new Date().toISOString(),
    channel: {
      type: health.type,
      status: health.status,
      enabled: health.config.enabled,
      lastCheck: health.lastCheck ? new Date(health.lastCheck).toISOString() : null,
      lastSuccess: health.lastSuccess ? new Date(health.lastSuccess).toISOString() : null,
      lastFailure: health.lastFailure ? new Date(health.lastFailure).toISOString() : null,
      consecutiveFailures: health.consecutiveFailures,
      totalChecks: health.totalChecks,
      totalFailures: health.totalFailures,
      avgLatency: health.avgLatency,
      lastError: health.lastError,
      config: health.config,
    },
  });
});

/**
 * POST /health/channels/:type/check
 * 手动触发健康检查
 */
router.post('/channels/:type/check', async (req, res) => {
  const { type } = req.params as { type: string };

  try {
    const result = await channelHealthMonitor.performHealthCheck(type as 'webhook' | 'wechat' | 'dingtalk');
    res.json({
      time: new Date().toISOString(),
      channel: type,
      result,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Health check failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /health/channels/:type/enable
 * 启用渠道
 */
router.post('/channels/:type/enable', (req, res) => {
  const { type } = req.params as { type: string };
  channelHealthMonitor.setEnabled(type as 'webhook' | 'wechat' | 'dingtalk', true);
  res.json({ success: true, enabled: true });
});

/**
 * POST /health/channels/:type/disable
 * 禁用渠道
 */
router.post('/channels/:type/disable', (req, res) => {
  const { type } = req.params as { type: string };
  channelHealthMonitor.setEnabled(type as 'webhook' | 'wechat' | 'dingtalk', false);
  res.json({ success: true, enabled: false });
});

/**
 * GET /health/sse
 * SSE 流推送健康状态变化
 */
router.get('/sse', (req, res) => {
  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 保持连接活跃
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // 注册客户端
  const removeClient = channelHealthMonitor.addSSEClient({
    write: (data) => res.write(data),
    destroy: () => {
      clearInterval(keepAlive);
      res.end();
    },
  });

  // 客户端断开时清理
  req.on('close', () => {
    removeClient();
    clearInterval(keepAlive);
  });

  req.on('end', () => {
    removeClient();
    clearInterval(keepAlive);
  });
});

/**
 * GET /health/config/sse
 * SSE 流推送配置变化
 */
router.get('/config/sse', (req, res) => {
  // 设置 SSE 头
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // 保持连接活跃
  const keepAlive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 30000);

  // 注册客户端
  const removeClient = configHotReload.addSSEClient({
    write: (data) => res.write(data),
    destroy: () => {
      clearInterval(keepAlive);
      res.end();
    },
  });

  // 客户端断开时清理
  req.on('close', () => {
    removeClient();
    clearInterval(keepAlive);
  });

  req.on('end', () => {
    removeClient();
    clearInterval(keepAlive);
  });
});

/**
 * GET /health/config
 * 获取当前配置
 */
router.get('/config', (_req, res) => {
  const entries = configHotReload.getAllEntries();

  res.json({
    time: new Date().toISOString(),
    files: entries.map(e => ({
      key: e.key,
      source: e.source,
      lastModified: new Date(e.lastModified).toISOString(),
      version: e.version,
    })),
  });
});

/**
 * POST /health/config/:key/rollback
 * 回滚配置到上一个版本
 */
router.post('/config/:key/rollback', (req, res) => {
  const { key } = req.params;

  if (key === 'all') {
    // 回滚所有配置
    const success = configHotReload.rollback();
    res.json({ success, message: success ? 'Rolled back' : 'No snapshots available' });
  } else {
    // 单个配置回滚（暂不支持，后续可扩展）
    res.status(501).json({ error: 'Single config rollback not implemented' });
  }
});

/**
 * POST /health/check
 * 全面健康检查（包含所有渠道）
 */
router.post('/check', async (req, res) => {
  const channels = ['webhook', 'wechat', 'dingtalk'] as const;
  const results: Record<string, { status: string; latency?: number; error?: string }> = {};

  // 并行检查所有渠道
  await Promise.all(
    channels.map(async (type) => {
      const result = await channelHealthMonitor.performHealthCheck(type);
      results[type] = {
        status: result.healthy ? 'healthy' : 'unhealthy',
        latency: result.latency,
        error: result.error,
      };
    })
  );

  const allHealthy = Object.values(results).every(r => r.status === 'healthy');

  res.json({
    time: new Date().toISOString(),
    overallStatus: allHealthy ? 'healthy' : 'degraded',
    channels: results,
  });
});

export default router;
