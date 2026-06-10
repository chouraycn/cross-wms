/* eslint-disable no-console */
import express from 'express';
import cors from 'cors';
import { initDb, getSessions, searchSessions, createSession, getSessionMessages, addMessage, deleteSession } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import skillWatcher from './services/skillWatcher.js';
import { callAIModelStream, AIAPIError } from './aiClient.js';

// Business data routes
import warehousesRouter from './routes/warehouses.js';
import inventoryRouter from './routes/inventory.js';
import transitRouter from './routes/transit.js';
import inboundRouter from './routes/inbound.js';
import outboundRouter from './routes/outbound.js';
import partnersRouter from './routes/partners.js';
import transferOrderRouter from './routes/transfer.js';
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
import wmsReplenishmentRoutes from './routes/wms-replenishment.js';

// Semantic matching routes
import matchingRoutes from './routes/matching.js';

// Model management routes
import modelsRoutes from './routes/models.js';

// Inventory NL-Query route (v1.5.0)
import inventoryNlQueryRouter from './routes/inventory-nl-query.js';

// Services
import { addClient, removeClient } from './services/chainExecutor.js';
import { batchAuditSkills } from './services/securityAuditor.js';
import { initMatchingEngine } from './services/matchingService.js';
import { loadModelsConfig, ModelsFile } from './modelsStore.js';
import { selectKey, reportKeyResult } from './keyRotator.js';

// Automation Engine v2.0
import { startEngine, stopEngine } from './engine/engine.js';

// MEMORY.md 路径
const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');
const MEMORY_MD_PATH = path.join(CDF_KNOW_CLOW_DIR, 'MEMORY.md');

// ===================== Auto Model Selection =====================

/**
 * 生成模拟响应（当未配置 API Key 时使用）
 */
function generateMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  const apiKeyGuide = `\n\n---\n💡 **配置 API Key 即可使用真正的 AI 对话**\n\n1. 点击对话界面顶部的「设置」按钮\n2. 在模型管理中选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n3. 填入对应服务商的 API Key\n4. 保存后即可开始真正的 AI 对话\n\n支持的服务商：OpenAI、DeepSeek、Anthropic、通义千问、Google Gemini、智谱、火山引擎等 20+ 平台`;

  if (msg.includes('你好') || msg.includes('hello') || msg.includes('hi') || msg.includes('在吗')) {
    return '你好！我是 AI 助手（模拟模式）。\n\n当前系统未配置 API Key，所以我返回的是预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能问答服务。' + apiKeyGuide;
  }

  if (msg.includes('库存') || msg.includes('仓库') || msg.includes('wms') || msg.includes('货物')) {
    return '关于仓库管理的问题（模拟模式）：\n\n当前系统支持以下 WMS 功能：\n- 📦 库存管理：实时查看各仓库库存水平\n- 🚚 出库管理：处理出库订单和拣货任务\n- 🔄 补货管理：智能补货建议和自动补货\n- 📊 数据分析：库存趋势、KPI 仪表盘\n- 🤖 AI 查询：用自然语言查询库存数据\n\n如需详细数据，请查看左侧导航栏的各个功能模块。' + apiKeyGuide;
  }

  if (msg.includes('帮助') || msg.includes('help') || msg.includes('功能') || msg.includes('怎么用')) {
    return '系统功能概览（模拟模式）：\n\n1. 🏠 仪表盘 - 数据概览和 KPI 监控\n2. 📦 仓库管理 - 多仓库管理和库存查询\n3. 🚚 出库管理 - 出库订单处理\n4. 🔄 补货管理 - 智能补货建议\n5. 🤖 AI 对话 - 跨仓库智能问答（需配置 API Key）\n6. ⚡ 自动化 - 自动化规则配置\n7. 🔧 技能管理 - AI 技能配置\n8. ⚙️ 系统设置 - 模型管理和参数配置\n\n💡 配置 API Key 后，AI 对话功能将提供真正的智能问答能力。';
  }

  if (msg.includes('api') || msg.includes('key') || msg.includes('密钥') || msg.includes('配置')) {
    return '**API Key 配置指南**\n\n要启用真正的 AI 对话功能，需要配置 API Key：\n\n1. **选择服务商**（推荐）：\n   - DeepSeek：https://platform.deepseek.com（性价比高，中文优秀）\n   - 通义千问：https://dashscope.aliyun.com（国内稳定）\n   - SiliconFlow：https://siliconflow.cn（有免费额度）\n\n2. **获取 API Key**：在对应平台注册账号并创建 API Key\n\n3. **配置到系统**：\n   - 点击对话界面顶部的「设置」按钮\n   - 选择你想使用的模型\n   - 填入 API Key 并保存\n\n4. **开始对话**：配置完成后即可使用真正的 AI 模型进行对话';
  }

  return `收到你的消息：「${userMessage}」\n\n（模拟模式）这是一个预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能、准确的回答。` + apiKeyGuide;
}

/** 模型能力分层（按优先级排序） */
const POWERFUL_MODEL_IDS = ['gpt-4o', 'gpt-4-turbo', 'claude-sonnet-4-20250514', 'qwen-plus', 'glm-4', 'moonshot-v1-128k'];
const FAST_MODEL_IDS = ['claude-haiku-3.5', 'qwen-turbo', 'hunyuan-turbo', 'deepseek-chat', 'doubao-pro-4k'];
const CODE_MODEL_IDS = ['deepseek-coder', 'gpt-4o', 'claude-sonnet-4-20250514'];
const LONG_CONTEXT_IDS = ['claude-sonnet-4-20250514', 'qwen-plus', 'moonshot-v1-128k', 'gpt-4o', 'gpt-4-turbo'];

/** Auto 选型结果 */
interface AutoSelectResult {
  modelId: string;
  modelName: string;
  /** 选型原因中文描述 */
  reason: string;
  /** 选型原因类型标签 */
  reasonType: 'code' | 'complex' | 'simple' | 'longContext' | 'default';
}

/**
 * Auto 模式：根据用户输入智能选择最合适的模型。
 *
 * 选型逻辑（按优先级）：
 * 1. 代码相关 → 代码专用 / 强力模型
 * 2. 超长文本 → 长上下文模型
 * 3. 复杂分析 → 强力模型
 * 4. 简单短对话 → 快速/轻量模型
 * 5. 默认 → 配置的默认模型
 *
 * @returns 选中的模型 ID + 选型原因
 */
function autoSelectModel(message: string, modelsConfig: ModelsFile): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  const fallback: AutoSelectResult = {
    modelId: enabledModels[0]?.id || 'gpt-4o',
    modelName: enabledModels[0]?.name || 'GPT-4o',
    reason: '默认模型',
    reasonType: 'default',
  };
  if (enabledModels.length === 0) return fallback;
  if (enabledModels.length === 1) {
    return { ...fallback, reason: '唯一可用模型', reasonType: 'default' };
  }

  const msg = message.toLowerCase();

  // 辅助：从指定 ID 列表中找第一个已启用的模型
  const findEnabled = (ids: string[]) => enabledModels.find((m) => ids.includes(m.id));

  // --- 检测代码信号 ---
  const codeSignals = [
    'function', 'class ', 'import ', 'const ', 'let ', 'var ',
    'def ', 'async ', 'await ', 'export ', 'require(',
    '```', '=>', 'interface ', 'type ', 'package ',
    'from ', 'return ', 'print(', 'console.',
    '#include', 'public static', 'func ', 'fn ',
    'struct ', 'impl ', 'match ', 'use ', 'mod ',
    '<script', '<style', 'npm ', 'yarn ', 'pip ',
  ];
  const isCode = codeSignals.some((s) => msg.includes(s)) || message.length > 1500;

  // --- 检测长上下文信号 ---
  const isLongContext = message.length > 8000;

  // --- 检测复杂度信号 ---
  const analysisKeywords = [
    '分析', '审查', 'review', 'explain', '解释', 'refactor',
    '重构', '优化', 'optimize', 'debug', '排查', '架构',
    '设计', 'design', '实现', '方案', '文档', '对比',
    'compare', 'evaluate', '评估', '总结', 'summarize',
    '推理', 'reasoning', '逻辑', 'logic', '证明',
  ];
  const isComplex = message.length > 300 || analysisKeywords.some((k) => msg.includes(k));

  // --- 检测简单信号 ---
  const isSimple = message.length < 80
    && !isCode
    && !isComplex
    && !analysisKeywords.some((k) => msg.includes(k));

  // --- 分层选择 ---
  // 1. 代码 → 代码专用 / 强力
  if (isCode) {
    const codeModel = findEnabled(CODE_MODEL_IDS) || findEnabled(POWERFUL_MODEL_IDS) || enabledModels[0];
    return {
      modelId: codeModel.id,
      modelName: codeModel.name,
      reason: `${codeModel.name} · 检测到代码内容，选择代码专用模型`,
      reasonType: 'code',
    };
  }

  // 2. 超长文本 → 长上下文模型
  if (isLongContext) {
    const longModel = findEnabled(LONG_CONTEXT_IDS) || enabledModels[0];
    return {
      modelId: longModel.id,
      modelName: longModel.name,
      reason: `${longModel.name} · 长文本内容，选择大上下文窗口模型`,
      reasonType: 'longContext',
    };
  }

  // 3. 复杂分析 → 强力模型
  if (isComplex) {
    const powerfulModel = findEnabled(POWERFUL_MODEL_IDS) || enabledModels[0];
    return {
      modelId: powerfulModel.id,
      modelName: powerfulModel.name,
      reason: `${powerfulModel.name} · 复杂分析任务，选择强力模型`,
      reasonType: 'complex',
    };
  }

  // 4. 简单短对话 → 快速/轻量模型
  if (isSimple) {
    const fastModel = findEnabled(FAST_MODEL_IDS)
      || enabledModels.find((m) => !POWERFUL_MODEL_IDS.includes(m.id))
      || enabledModels[0];
    return {
      modelId: fastModel.id,
      modelName: fastModel.name,
      reason: `${fastModel.name} · 简单对话，选择快速模型`,
      reasonType: 'simple',
    };
  }

  // 5. 默认 → 配置的默认模型，或第一个已启用模型
  const defaultModel = enabledModels.find((m) => m.id === modelsConfig.defaultModelId) || enabledModels[0];
  return {
    modelId: defaultModel.id,
    modelName: defaultModel.name,
    reason: `${defaultModel.name} · 使用默认模型`,
    reasonType: 'default',
  };
}

// ===================== Model Parameter Presets =====================

/** 模型参数预设 */
const MODEL_PRESETS: Record<string, { temperature: number; topP: number; label: string; description: string }> = {
  creative: { temperature: 1.3, topP: 0.95, label: '创意写作', description: '高温度，适合创意、头脑风暴' },
  code:     { temperature: 0.2, topP: 0.8,  label: '代码生成', description: '低温度，确保代码准确性' },
  translate:{ temperature: 0.3, topP: 0.85, label: '翻译', description: '适中温度，保持翻译一致性' },
  analysis: { temperature: 0.5, topP: 0.9, label: '分析推理', description: '平衡温度，适合逻辑分析' },
  precise:  { temperature: 0.1, topP: 0.7, label: '精确问答', description: '极低温度，追求事实准确性' },
};

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
  const { sessionId, message, model = 'auto', skillContext, skillId, preset, conversationHistory } = req.body;
  console.log(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, message="${message?.slice(0, 30)}"`);

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Auto 模式：智能选择最合适的模型
    const modelsConfig = await loadModelsConfig();
    let effectiveModel: string;
    let autoReason: string | undefined;
    let autoReasonType: string | undefined;
    if (model === 'auto') {
      const autoResult = autoSelectModel(message, modelsConfig);
      effectiveModel = autoResult.modelId;
      autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
      autoReasonType = autoResult.reasonType;
      console.log(`[Auto Model] ${autoResult.reasonType} → ${autoResult.modelName} (${autoResult.modelId})`);
    } else {
      effectiveModel = model;
    }

    // 应用参数预设
    const activePreset = preset && MODEL_PRESETS[preset] ? MODEL_PRESETS[preset] : null;

    // 确保会话存在，如果不存在则自动创建
    const sessions = getSessions();
    const sessionExists = sessions.some(s => s.id === sessionId);
    if (!sessionExists) {
      createSession(sessionId, '新对话', effectiveModel, undefined);
    }

    // 保存用户消息（不回显到 SSE 流，避免前端将用户输入混入 AI 回复内容）
    const userMsg = addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null });

    // 发送初始化事件（Auto 模式附加选择原因 + 预设信息）
    const assistantId = uuidv4();
    res.write(`data: ${JSON.stringify({
      type: 'init',
      sessionId,
      assistantMessageId: assistantId,
      model: effectiveModel,
      autoReason,
      autoReasonType,
      preset: activePreset ? { id: preset, label: activePreset.label } : null,
    })}\n\n`);

    // 调用 AI 模型 API 进行流式对话
    let fullContent = '';
    let selectedKeyIndex = -1;
    try {
      // 查找模型配置
      const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);

      if (!modelConfig) {
        throw new Error(`未找到模型配置: ${effectiveModel}`);
      }

      // 使用 KeyRotator 选择 API Key（支持多 Key 轮询/故障转移）
      const keyResult = selectKey(modelConfig);
      let effectiveApiKey = modelConfig.apiKey || '';
      if (keyResult) {
        effectiveApiKey = keyResult.key;
        selectedKeyIndex = keyResult.index;
      }

      // 构建消息列表（含上下文）
      const apiMessages: Array<{ role: string; content: string }> = [];

      // 注入 MEMORY.md 上下文
      const memoryContent = readMemoryMd();
      if (memoryContent.trim()) {
        apiMessages.push({ role: 'system', content: memoryContent.trim() });
      }

      // 注入技能上下文
      if (skillContext && typeof skillContext === 'string' && skillContext.trim()) {
        apiMessages.push({ role: 'system', content: skillContext.trim() });
      }

      // 注入引用的会话上下文
      const referencedSessionIds = req.body.referencedSessionIds;
      if (Array.isArray(referencedSessionIds) && referencedSessionIds.length > 0) {
        let sessionContext = '';
        for (const refId of referencedSessionIds) {
          const refMessages = getSessionMessages(refId);
          if (refMessages.length > 0) {
            const sessionInfo = getSessions().find((s: { id: string }) => s.id === refId);
            const sessionTitle = sessionInfo ? sessionInfo.title : refId;
            sessionContext += `\n## 会话：${sessionTitle}\n`;
            for (const msg of refMessages.slice(-10)) {
              const role = msg.role === 'user' ? 'User' : 'Assistant';
              sessionContext += `${role}: ${msg.content}\n`;
            }
          }
        }
        if (sessionContext) {
          apiMessages.push({ role: 'system', content: `<referenced-sessions>\n${sessionContext}\n</referenced-sessions>` });
        }
      }

      // 添加历史对话（如果前端传了 conversationHistory）
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            apiMessages.push({ role: msg.role, content: msg.content });
          }
        }
      }

      // 添加当前用户消息
      apiMessages.push({ role: 'user', content: message });

      // 合并模型配置和预设参数
      const finalModelConfig = {
        ...modelConfig,
        apiKey: effectiveApiKey,
        temperature: activePreset ? activePreset.temperature : modelConfig.temperature,
        topP: activePreset ? activePreset.topP : modelConfig.topP,
      };

      // 创建 AbortController 用于超时控制
      const abortController = new AbortController();
      const timeout = setTimeout(() => abortController.abort(), 120000); // 2分钟超时

      try {
        // 无 API Key 时使用模拟模式
        if (!effectiveApiKey) {
          console.log(`[Chat API] 模型 ${effectiveModel} 未配置 API Key，使用模拟模式`);
          const mockResponse = generateMockResponse(message);
          const segments = mockResponse.match(/[\s\S]{1,5}/g) || [mockResponse];
          for (const segment of segments) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: segment })}\n\n`);
            await new Promise(r => setTimeout(r, 15));
          }
          fullContent = mockResponse;
        } else {
          // 调用 AI 模型流式 API
          fullContent = await callAIModelStream(
            finalModelConfig,
            apiMessages,
            (chunk) => {
              res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            },
            abortController.signal,
          );
        }
      } finally {
        clearTimeout(timeout);
      }

      // 保存完整的助手回复
      addMessage({ sessionId, role: 'assistant', content: fullContent, model: effectiveModel, skillId: skillId || null });
      // 报告 Key 使用成功
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, true);
      }
    } catch (apiError) {
      console.error('[Chat API] AI API error:', apiError);
      console.error('[Chat API] Stack trace:', apiError instanceof Error ? apiError.stack : 'N/A');

      // 重置 fullContent，避免包含之前流式回调写入的内容（如用户输入回显）
      fullContent = '';

      // 根据错误类型生成友好的错误信息
      let errorMsg: string;
      let errorCode: string | null = null;

      if (apiError instanceof AIAPIError) {
        switch (apiError.category) {
          case 'auth':
            errorMsg = 'API Key 无效或已过期，请在「模型管理」中检查密钥配置。';
            errorCode = 'AUTH_FAILED';
            break;
          case 'rate_limit':
            errorMsg = '请求过于频繁，已达到速率限制，请稍后再试。';
            errorCode = 'RATE_LIMITED';
            break;
          case 'network':
            errorMsg = '网络连接失败，请检查网络或 API 端点配置。';
            errorCode = 'NETWORK_ERROR';
            break;
          case 'timeout':
            errorMsg = '请求超时，模型响应时间过长，请稍后重试。';
            errorCode = 'TIMEOUT';
            break;
          case 'server':
            errorMsg = 'AI 服务商暂时不可用，请稍后重试。';
            errorCode = 'SERVER_ERROR';
            break;
          default:
            errorMsg = `AI 服务暂时不可用：${apiError.message}`;
            errorCode = 'UNKNOWN_ERROR';
        }
      } else if (apiError instanceof Error && apiError.name === 'AbortError') {
        errorMsg = '请求已取消。';
        errorCode = 'ABORTED';
      } else {
        const errMessage = apiError instanceof Error ? apiError.message : '未知错误';
        // Ollama / 本地模型连接失败的专门提示
        if (errMessage.includes('stdout closed') || errMessage.includes('ENOENT') || errMessage.includes('ECONNREFUSED') || errMessage.includes('connect')) {
          errorMsg = `无法连接到 AI 模型服务（${effectiveModel}）。请确认模型服务已启动。\n提示：如果使用 Ollama，请先运行 'ollama serve' 启动服务。`;
          errorCode = 'MODEL_UNAVAILABLE';
        } else {
          errorMsg = `抱歉，AI 服务暂时不可用，请稍后重试。\n错误：${errMessage}`;
          errorCode = 'UNKNOWN_ERROR';
        }
      }

      res.write(`data: ${JSON.stringify({ type: 'text', content: errorMsg })}\n\n`);
      addMessage({ sessionId, role: 'assistant', content: errorMsg, model: effectiveModel, skillId: skillId || null });
      // 报告 Key 使用失败（触发故障转移）
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, false);
      }

      // 发送带错误码的 done 事件
      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          errorCode,
          errorMessage: errorMsg,
        })}\n\n`);
        res.end();
      } catch {
        // 响应流可能已关闭，忽略
      }
      return;
    }

    // 正常完成：发送 done 事件
    try {
      res.write(`data: ${JSON.stringify({
        type: 'done',
        errorCode: null,
        errorMessage: null,
      })}\n\n`);
      res.end();
    } catch {
      // 响应流可能已关闭，忽略
    }
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
app.use('/api/transfer-orders', transferOrderRouter);
app.use('/api/partners', partnersRouter);
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
app.use('/api/wms/replenishment', wmsReplenishmentRoutes);

// Semantic matching engine routes
app.use('/api/matching', matchingRoutes);

// Model management routes
app.use('/api/models', modelsRoutes);

// Inventory NL-Query route (v1.5.0)
app.use('/api/inventory', inventoryNlQueryRouter);

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
