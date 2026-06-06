/* eslint-disable no-console */
import express from 'express';
import cors from 'cors';
import { initDb, getSessions, searchSessions, createSession, getSessionMessages, addMessage, deleteSession } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import { query } from '@tencent-ai/agent-sdk';
import path from 'path';
import fs from 'fs';
import os from 'os';
import skillWatcher from './services/skillWatcher.js';

// Business data routes
import warehousesRouter from './routes/warehouses.js';
import inventoryRouter from './routes/inventory.js';
import transitRouter from './routes/transit.js';
import inboundRouter from './routes/inbound.js';
import outboundRouter from './routes/outbound.js';
import skillsRouter from './routes/skills.js';
import settingsRouter from './routes/settings.js';
import migrateRouter from './routes/migrate.js';
import chainRoutes from './routes/chainRoutes.js';
import { findByQuery, countByQuery } from './dao/inventoryTransactionDao.js';

// Services
import { addClient, removeClient } from './services/chainExecutor.js';
import { batchAuditSkills } from './services/securityAuditor.js';

// MEMORY.md 路径
const CROSSWMS_DIR = path.join(os.homedir(), '.crosswms');
const MEMORY_MD_PATH = path.join(CROSSWMS_DIR, 'MEMORY.md');

/** 读取 MEMORY.md 内容，不存在则返回空字符串 */
function readMemoryMd(): string {
  try {
    if (fs.existsSync(MEMORY_MD_PATH)) {
      return fs.readFileSync(MEMORY_MD_PATH, 'utf-8');
    }
  } catch (e) {
    console.error('[Memory] 读取失败:', e);
  }
  return '';
}

/** 写入 MEMORY.md 内容 */
function writeMemoryMd(content: string): void {
  try {
    if (!fs.existsSync(CROSSWMS_DIR)) {
      fs.mkdirSync(CROSSWMS_DIR, { recursive: true });
    }
    fs.writeFileSync(MEMORY_MD_PATH, content, 'utf-8');
  } catch (e) {
    console.error('[Memory] 写入失败:', e);
    throw e;
  }
}

/**
 * 获取 Node.js 可执行路径，用于 agent-sdk 内部 spawn。
 * DMG 模式下 node 不在系统 PATH 中，需要从 CROSSWMS_NODE_PATH 或 process.execPath 推导。
 */
function getNodeExecutable(): string | undefined {
  // 1. 环境变量显式指定
  const envNode = process.env.CROSSWMS_NODE_PATH;
  if (envNode) return envNode;
  // 2. 如果 process.execPath 指向真正的 node（而非 PyInstaller 的 python）
  if (process.execPath.endsWith('node') || process.execPath.endsWith('node.exe')) {
    return process.execPath;
  }
  // 3. 从 PATH 中找
  return undefined;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '3mb' }));

// 初始化 Skill Watcher
skillWatcher.init();

// 健康检查
app.get('/api/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// SSE 端点：监听技能变化
app.get('/api/skill-events', (_req, res) => {
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
app.get('/api/chain-execution-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
  });

  const execId = req.query.execId as string | undefined;
  if (execId) {
    addClient(execId, res);
  }

  req.on('close', () => {
    if (execId) {
      removeClient(execId, res);
    }
  });
});

// ========== MEMORY.md API ==========

// 读取 MEMORY.md
app.get('/api/memory', (_req, res) => {
  const content = readMemoryMd();
  res.json({ content });
});

// 更新 MEMORY.md
app.post('/api/memory', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content must be a string' });
    return;
  }
  try {
    writeMemoryMd(content);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '写入失败' });
  }
});

// 获取会话列表（支持?q=搜索参数）
app.get('/api/sessions', (req, res) => {
  const q = req.query.q as string | undefined;
  const sessions = q ? searchSessions(q) : getSessions();
  res.json({ sessions });
});

// 创建会话
app.post('/api/sessions', (req, res) => {
  const { title, model, agentId } = req.body;
  const session = createSession(uuidv4(), title || '新对话', model || 'claude-sonnet-4', agentId);
  res.json({ session });
});

// 获取会话消息
app.get('/api/sessions/:id', (req, res) => {
  const messages = getSessionMessages(req.params.id);
  res.json({ messages });
});

// 删除会话
app.delete('/api/sessions/:id', (req, res) => {
  deleteSession(req.params.id);
  res.json({ ok: true });
});

// 发送消息（SSE）
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model = 'claude-sonnet-4', skillContext, skillId } = req.body;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // 确保会话存在，如果不存在则自动创建
    const sessions = getSessions();
    const sessionExists = sessions.some(s => s.id === sessionId);
    if (!sessionExists) {
      createSession(sessionId, '新对话', model, undefined);
    }

    // 保存用户消息
    const userMsg = addMessage({ sessionId, role: 'user', content: message, model, skillId: skillId || null });
    res.write(`data: ${JSON.stringify({ type: 'text', content: userMsg.content })}\n\n`);

    // 发送初始化事件
    const assistantId = uuidv4();
    res.write(`data: ${JSON.stringify({ type: 'init', sessionId, assistantMessageId: assistantId, model })}\n\n`);

    // 调用 Agent SDK 进行流式对话
    let fullContent = '';
    try {
      // 构建 query 选项，DMG 模式下需指定 node 可执行路径
      const queryOptions: Record<string, unknown> = {
        model,
        permissionMode: 'bypassPermissions',
        cwd: process.cwd(),
      };
      const nodeExe = getNodeExecutable();
      if (nodeExe) {
        // 将 node 目录加入 PATH，确保 agent-sdk 内部 spawn('node', ...) 能找到
        const nodeDir = path.dirname(nodeExe);
        const currentPath = process.env.PATH || '';
        if (!currentPath.split(path.delimiter).includes(nodeDir)) {
          process.env.PATH = nodeDir + path.delimiter + currentPath;
        }
      }

      // 注入 MEMORY.md 上下文到 prompt
      const memoryContent = readMemoryMd();
      let finalPrompt = message;
      if (memoryContent.trim()) {
        finalPrompt = `<memory>\n${memoryContent.trim()}\n</memory>\n\n${finalPrompt}`;
      }

      // 注入引用的会话上下文到 prompt
      const referencedSessionIds = req.body.referencedSessionIds;
      if (Array.isArray(referencedSessionIds) && referencedSessionIds.length > 0) {
        let sessionContext = '\n<referenced-sessions>\n';
        for (const sessionId of referencedSessionIds) {
          const refMessages = getSessionMessages(sessionId);
          if (refMessages.length > 0) {
            const sessionInfo = getSessions().find((s: { id: string }) => s.id === sessionId);
            const sessionTitle = sessionInfo ? sessionInfo.title : sessionId;
            sessionContext += `\n## 会话：${sessionTitle}\n`;
            for (const msg of refMessages.slice(-10)) { // 只取最后 10 条消息避免过长
              const role = msg.role === 'user' ? 'User' : 'Assistant';
              sessionContext += `${role}: ${msg.content}\n`;
            }
          }
        }
        sessionContext += '</referenced-sessions>\n';
        finalPrompt = sessionContext + '\n' + finalPrompt;
      }

      // 注入技能上下文到 prompt
      if (skillContext && typeof skillContext === 'string' && skillContext.trim()) {
        finalPrompt = `<skill-context>\n${skillContext.trim()}\n</skill-context>\n\n${finalPrompt}`;
      }

      const queryInstance = query({
        prompt: finalPrompt,
        options: queryOptions,
      });

      // 处理流式响应
      for await (const msg of queryInstance) {
        if (msg.type === 'assistant') {
          for (const block of msg.message.content) {
            if (block.type === 'text') {
              fullContent += block.text;
              res.write(`data: ${JSON.stringify({ type: 'text', content: block.text })}\n\n`);
            }
          }
        }
      }

      // 保存完整的助手回复
      addMessage({ sessionId, role: 'assistant', content: fullContent, model, skillId: skillId || null });
    } catch (sdkError) {
      console.error('[Chat API] Agent SDK error:', sdkError);
      console.error('[Chat API] Stack trace:', sdkError instanceof Error ? sdkError.stack : 'N/A');
      const errorMsg = `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${sdkError instanceof Error ? sdkError.message : '未知错误'}`;
      res.write(`data: ${JSON.stringify({ type: 'text', content: errorMsg })}\n\n`);
      addMessage({ sessionId, role: 'assistant', content: errorMsg, model, skillId: skillId || null });
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (error) {
    console.error('Chat API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '服务器内部错误' })}\n\n`);
      res.end();
    }
  }
});

// 权限响应（占位）
app.post('/api/permission-response', (_req, res) => res.json({ ok: true }));

// 模型列表（占位）
app.get('/api/models', (_req, res) => {
  res.json({ models: [
    { modelId: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { modelId: 'gpt-4o', name: 'GPT-4o' },
  ]});
});

// Agent 列表（占位）
app.get('/api/agents', (_req, res) => {
  res.json({ agents: [
    { id: 'default', name: '通用助手', description: '一个通用的 AI 助手', systemPrompt: '你是一个专业的AI助手' }
  ]});
});

// ========== Business Data API Routes ==========

app.use('/api/warehouses', warehousesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/transit-orders', transitRouter);
app.use('/api/inbound-records', inboundRouter);
app.use('/api/outbound-records', outboundRouter);
app.use('/api', skillsRouter); // handles /api/user-skills and /api/builtin-status-patches
app.use('/api/app-settings', settingsRouter);
app.use('/api/migrate', migrateRouter);

// Skill chain routes
app.use('/api/skill-chains', chainRoutes);
app.use('/api/chain-executions', chainRoutes);

// GET /api/inventory-transactions?page=1&pageSize=20&type=inbound&warehouseId=wh1&startDate=2026-01-01&endDate=2026-05-25&sku=ABC
app.get('/api/inventory-transactions', (req, res) => {
  const page = parseInt(req.query.page as string, 10) || 1;
  const pageSize = parseInt(req.query.pageSize as string, 10) || 20;
  const type = req.query.type as string | undefined;
  const warehouseId = req.query.warehouseId as string | undefined;
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const sku = req.query.sku as string | undefined;

  const items = findByQuery({ type, warehouseId, startDate, endDate, sku, page, pageSize });
  const total = countByQuery({ type, warehouseId, startDate, endDate, sku });

  res.json({
    code: 0,
    data: { items, total, page, pageSize },
    message: 'ok',
  });
});

const PORT = 3001;
const server = app.listen(PORT, () => {
  console.log(`CrossWMS Chat Server running on port ${PORT}`);
  initDb();
});

// 异步批量审查预置技能（不阻塞启动，延迟 5 秒执行）
setTimeout(() => {
  batchAuditSkills().catch((e: Error) => console.error('[Startup] 批量审查失败:', e));
}, 5000);

// 端口冲突时优雅退出（让 pywebview 的进程监控 3 秒后重启，彼时端口已释放）
server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] ❌ 端口 ${PORT} 已被占用，2 秒后退出并等待重启...`);
    setTimeout(() => process.exit(1), 2000);
  } else {
    console.error('[Server] ❌ 启动失败:', err.message);
    process.exit(1);
  }
});
