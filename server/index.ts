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
import automationRoutes from './routes/automation.js';

// Projects & Tasks routes
import projectsRouter from './routes/projects.js';
import tasksRouter from './routes/tasks.js';

import { findByQuery, countByQuery } from './dao/inventoryTransactionDao.js';
import { ensureWmsTables } from './dao/wmsSkillDao.js';

// WMS skill routes
import wmsQualityRoutes from './routes/wms-quality.js';
import wmsInventoryRoutes from './routes/wms-inventory.js';
import wmsOutboundRoutes from './routes/wms-outbound.js';
import wmsAlertRoutes from './routes/wms-alert.js';
import wmsReportRoutes from './routes/wms-report.js';

// Semantic matching routes
import matchingRoutes from './routes/matching.js';

// Model management routes
import modelsRoutes from './routes/models.js';

// Services
import { addClient, removeClient } from './services/chainExecutor.js';
import { batchAuditSkills } from './services/securityAuditor.js';
import { initMatchingEngine } from './services/matchingService.js';
import { loadModelsConfig, ModelsFile } from './modelsStore.js';

// Automation Engine v2.0
import { startEngine, stopEngine } from './engine/engine.js';

// MEMORY.md 路径
const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');
const MEMORY_MD_PATH = path.join(CDF_KNOW_CLOW_DIR, 'MEMORY.md');

// ===================== Auto Model Selection =====================

/** 模型能力分层 */
const POWERFUL_MODEL_IDS = ['gpt-4o', 'gpt-4-turbo', 'claude-sonnet-4-20250514', 'qwen-plus'];
const FAST_MODEL_IDS = ['claude-haiku-3.5'];
const CODE_MODEL_IDS = ['deepseek-coder'];

/**
 * Auto 模式：根据用户输入智能选择最合适的模型。
 *
 * 策略：
 * - 检测到代码 → 优先用代码专用模型 / 强力模型
 * - 输入复杂（长文本、分析类关键词）→ 优先用强力模型
 * - 简单短问题 → 优先用轻量快速模型
 * - 默认 → 使用配置的 defaultModelId 或首个已启用模型
 *
 * @returns 选中的模型 ID
 */
function autoSelectModel(message: string, modelsConfig: ModelsFile): string {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  if (enabledModels.length === 0) return 'claude-sonnet-4';
  if (enabledModels.length === 1) return enabledModels[0].id;

  const msg = message.toLowerCase();

  // 辅助：从指定 ID 列表中找第一个已启用的模型
  const findEnabled = (ids: string[]) => enabledModels.find((m) => ids.includes(m.id));

  // --- 检测代码信号 ---
  const codeSignals = [
    'function', 'class ', 'import ', 'const ', 'let ', 'var ',
    'def ', 'async ', 'await ', 'export ', 'require(',
    '```', '=>', 'interface ', 'type ', 'package ',
    'from ', 'return ', 'print(', 'console.',
  ];
  const isCode = codeSignals.some((s) => msg.includes(s)) || message.length > 1000;

  // --- 检测复杂度信号 ---
  const analysisKeywords = [
    '分析', '审查', 'review', 'explain', '解释', 'refactor',
    '重构', '优化', 'optimize', 'debug', '排查', '架构',
    '设计', 'design', '实现', '方案', '文档',
  ];
  const isComplex = message.length > 300 || analysisKeywords.some((k) => msg.includes(k)) || isCode;

  // --- 检测简单信号 ---
  const isSimple = message.length < 50
    && !isCode
    && !analysisKeywords.some((k) => msg.includes(k));

  // --- 分层选择 ---
  // 1. 代码 → 代码专用 / 强力
  if (isCode) {
    return findEnabled(CODE_MODEL_IDS)?.id
      || findEnabled(POWERFUL_MODEL_IDS)?.id
      || enabledModels[0].id;
  }

  // 2. 复杂分析 → 强力模型
  if (isComplex) {
    return findEnabled(POWERFUL_MODEL_IDS)?.id
      || enabledModels[0].id;
  }

  // 3. 简单短对话 → 快速/轻量模型
  if (isSimple) {
    // 优先快速模型，否则选非强力模型（省成本），都无则用第一个
    return findEnabled(FAST_MODEL_IDS)?.id
      || enabledModels.find((m) => !POWERFUL_MODEL_IDS.includes(m.id))?.id
      || enabledModels[0].id;
  }

  // 4. 默认 → 配置的默认模型，或第一个已启用模型
  const defaultModel = enabledModels.find((m) => m.id === modelsConfig.defaultModelId);
  return defaultModel?.id || enabledModels[0].id;
}

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
    if (!fs.existsSync(CDF_KNOW_CLOW_DIR)) {
      fs.mkdirSync(CDF_KNOW_CLOW_DIR, { recursive: true });
    }
    fs.writeFileSync(MEMORY_MD_PATH, content, 'utf-8');
  } catch (e) {
    console.error('[Memory] 写入失败:', e);
    throw e;
  }
}

/**
 * 获取 Node.js 可执行路径，用于 agent-sdk 内部 spawn。
 * DMG 模式下 node 不在系统 PATH 中，需要从 CDF_KNOW_CLOW_NODE_PATH 或 process.execPath 推导。
 */
function getNodeExecutable(): string | undefined {
  // 1. 环境变量显式指定
  const envNode = process.env.CDF_KNOW_CLOW_NODE_PATH;
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
  const session = createSession(uuidv4(), title || '新对话', model || 'auto', agentId);
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
  const { sessionId, message, model = 'auto', skillContext, skillId } = req.body;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Auto 模式：智能选择最合适的模型
    const modelsConfig = loadModelsConfig();
    let effectiveModel: string;
    let autoReason: string | undefined;
    if (model === 'auto') {
      effectiveModel = autoSelectModel(message, modelsConfig);
      const autoSelectedConfig = modelsConfig.models.find((m) => m.id === effectiveModel);
      autoReason = autoSelectedConfig?.name || effectiveModel;
      console.log(`[Auto Model] 输入复杂度分析 → 选择: ${autoReason} (${effectiveModel})`);
    } else {
      effectiveModel = model;
    }

    // 确保会话存在，如果不存在则自动创建
    const sessions = getSessions();
    const sessionExists = sessions.some(s => s.id === sessionId);
    if (!sessionExists) {
      createSession(sessionId, '新对话', effectiveModel, undefined);
    }

    // 保存用户消息
    const userMsg = addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null });
    res.write(`data: ${JSON.stringify({ type: 'text', content: userMsg.content })}\n\n`);

    // 发送初始化事件（Auto 模式附加选择原因）
    const assistantId = uuidv4();
    res.write(`data: ${JSON.stringify({ type: 'init', sessionId, assistantMessageId: assistantId, model: effectiveModel, autoReason })}\n\n`);

    // 调用 Agent SDK 进行流式对话
    let fullContent = '';
    try {
      // 查找模型配置
      const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);

      // 构建 query 选项，桌面端模式下需指定 node 可执行路径
      const queryOptions: Record<string, unknown> = {
        model: effectiveModel,
        permissionMode: 'bypassPermissions',
        cwd: process.cwd(),
      };
      if (modelConfig) {
        if (modelConfig.apiEndpoint) queryOptions.apiEndpoint = modelConfig.apiEndpoint;
        if (modelConfig.apiKey) queryOptions.apiKey = modelConfig.apiKey;
        if (typeof modelConfig.temperature === 'number') queryOptions.temperature = modelConfig.temperature;
        if (typeof modelConfig.topP === 'number') queryOptions.topP = modelConfig.topP;
      }
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
      addMessage({ sessionId, role: 'assistant', content: fullContent, model: effectiveModel, skillId: skillId || null });
    } catch (sdkError) {
      console.error('[Chat API] Agent SDK error:', sdkError);
      console.error('[Chat API] Stack trace:', sdkError instanceof Error ? sdkError.stack : 'N/A');
      const errorMsg = `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${sdkError instanceof Error ? sdkError.message : '未知错误'}`;
      res.write(`data: ${JSON.stringify({ type: 'text', content: errorMsg })}\n\n`);
      addMessage({ sessionId, role: 'assistant', content: errorMsg, model: effectiveModel, skillId: skillId || null });
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

// ========== Business Data API Routes ==========

app.use('/api/warehouses', warehousesRouter);
app.use('/api/inventory', inventoryRouter);
app.use('/api/transit-orders', transitRouter);
app.use('/api/inbound-records', inboundRouter);
app.use('/api/outbound-records', outboundRouter);
app.use('/api', skillsRouter); // handles /api/user-skills and /api/builtin-status-patches
app.use('/api/app-settings', settingsRouter);
app.use('/api/migrate', migrateRouter);

// Projects & Tasks routes
app.use('/api/projects', projectsRouter);
app.use('/api/tasks', tasksRouter);


// Automation webhook routes
app.use('/api/automation', automationRoutes);

// Skill chain routes
app.use('/api/skill-chains', chainRoutes);
app.use('/api/chain-executions', chainRoutes);

// WMS skill routes
app.use('/api/wms/quality', wmsQualityRoutes);
app.use('/api/wms/inventory-count', wmsInventoryRoutes);
app.use('/api/wms/outbound-review', wmsOutboundRoutes);
app.use('/api/wms/alerts', wmsAlertRoutes);
app.use('/api/wms/reports', wmsReportRoutes);

// Semantic matching engine routes
app.use('/api/matching', matchingRoutes);

// Model management routes
app.use('/api/models', modelsRoutes);

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
  console.log(`CDF Know Clow Chat Server running on port ${PORT}`);
  const db = initDb();

  // 初始化 WMS 行业技能表
  ensureWmsTables(db);

  // 初始化语义匹配引擎（异步，不阻塞启动）
  setTimeout(() => {
    try {
      const stats = initMatchingEngine();
      console.log(`[Matching] 嵌入初始化完成: total=${stats.embeddingStats.total}, new=${stats.embeddingStats.newCount}, updated=${stats.embeddingStats.updatedCount}, skipped=${stats.embeddingStats.skippedCount}`);
    } catch (e) {
      console.error('[Matching] 嵌入初始化失败:', e);
    }
  }, 3000);

  // 启动自动化引擎 v2.0（30s 轮询）
  const { stop } = startEngine(30_000);
  // 绑定优雅关闭 — 在进程退出时停止引擎
  const gracefulShutdown = () => {
    console.log('[Server] 正在关闭自动化引擎...');
    stop();
  };
  process.on('SIGTERM', gracefulShutdown);
  process.on('SIGINT', gracefulShutdown);
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
