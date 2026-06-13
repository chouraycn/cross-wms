import { Router } from 'express';
import skillWatcher from '../services/skillWatcher.js';
import { addClient, removeClient } from '../services/chainExecutor.js';

const router = Router();

// SSE 端点：监听技能变化
router.get('/skill-events', (_req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // 注册 SSE 客户端
  skillWatcher.addClient(res);

  // 客户端断开连接时清理
  _req.on('close', () => {
    skillWatcher.removeClient(res);
  });
});

// SSE 端点：监听链执行事件
router.get('/chain-execution-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',  // Disable nginx buffering
  });

  const execId = req.query.execId as string | undefined;
  if (execId) {
    addClient(execId, res);

    // Send initial connected event
    res.write(`data: ${JSON.stringify({
      type: 'connected',
      executionId: execId,
      timestamp: new Date().toISOString(),
    })}\n\n`);
  }

  // Keepalive heartbeat: send a comment every 30s to keep connection alive
  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 30000);

  // Flush headers immediately
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  req.on('close', () => {
    clearInterval(heartbeat);
    if (execId) {
      removeClient(execId, res);
    }
  });
});

export default router;
