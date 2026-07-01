/**
 * Soul 规则管理 REST API
 *
 * 提供：
 * - GET    /api/soul/current         — 获取当前规则配置
 * - GET    /api/soul/files           — 获取所有规则文件列表
 * - GET    /api/soul/events          — SSE 实时事件流
 * - POST   /api/soul/reload          — 手动触发重新加载
 * - PUT    /api/soul/file            — 更新规则文件内容
 */

import { Router } from 'express';
import soulWatcher from '../engine/soul/watcher.js';
import { buildSoulSystemMessage, getMergedStrategyPreferences } from '../engine/soulLoader.js';
import { logger } from '../logger.js';

const router = Router();

// ===================== API Routes =====================

/**
 * GET /api/soul/current
 * 获取当前规则配置
 */
router.get('/current', (_req, res) => {
  try {
    const profile = soulWatcher.getCurrentProfile();
    if (!profile) {
      return res.status(404).json({ error: '未找到 Soul 配置' });
    }

    const systemMessage = buildSoulSystemMessage();
    const strategyPreferences = getMergedStrategyPreferences();

    res.json({
      profile,
      systemMessage,
      strategyPreferences,
    });
  } catch (e) {
    logger.error('[Soul API] Failed to get current profile:', e);
    res.status(500).json({
      error: `获取配置失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/soul/files
 * 获取所有规则文件列表
 */
router.get('/files', (_req, res) => {
  try {
    const files = soulWatcher.getAllSoulFiles();
    res.json({ files });
  } catch (e) {
    logger.error('[Soul API] Failed to get soul files:', e);
    res.status(500).json({
      error: `获取文件列表失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/soul/events
 * SSE 实时事件流（监听规则变化）
 */
router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no', // 禁用 nginx 缓冲
  });

  // 注册 SSE 客户端
  soulWatcher.addClient(res);

  // 发送初始连接事件
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    timestamp: Date.now(),
  })}\n\n`);

  // 心跳：每 30 秒发送注释保持连接
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // 立即刷新 headers
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // 客户端断开连接时清理
  req.on('close', () => {
    clearInterval(heartbeat);
    soulWatcher.removeClient(res);
  });
});

/**
 * POST /api/soul/reload
 * 手动触发重新加载
 */
router.post('/reload', (_req, res) => {
  try {
    const profile = soulWatcher.reload();
    const systemMessage = buildSoulSystemMessage();
    const strategyPreferences = getMergedStrategyPreferences();

    res.json({
      success: true,
      profile,
      systemMessage,
      strategyPreferences,
      timestamp: Date.now(),
    });
  } catch (e) {
    logger.error('[Soul API] Failed to reload profile:', e);
    res.status(500).json({
      error: `重新加载失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * PUT /api/soul/file
 * 更新规则文件内容
 */
router.put('/file', (req, res) => {
  try {
    const { fileType, content } = req.body;

    if (!fileType || !['soul', 'user'].includes(fileType)) {
      return res.status(400).json({ error: 'fileType 必须是 "soul" 或 "user"' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content 不能为空' });
    }

    // 基本验证：文件大小限制（防止过大文件）
    if (content.length > 100000) {
      return res.status(400).json({ error: '文件内容过大（最大 100KB）' });
    }

    soulWatcher.updateFile(fileType as 'soul' | 'user', content);

    res.json({
      success: true,
      fileType,
      timestamp: Date.now(),
    });
  } catch (e) {
    logger.error('[Soul API] Failed to update file:', e);
    res.status(500).json({
      error: `更新文件失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

export default router;