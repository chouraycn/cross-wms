/* eslint-disable no-console */
import express from 'express';
import cors from 'cors';
import { initDb, getSessions, searchSessions, createSession, getSessionMessages, addMessage, deleteSession } from './db.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import os from 'os';
import skillWatcher from './services/skillWatcher.js';
import { callAIModelStream, callAIModel, AIAPIError } from './aiClient.js';
import type { MessageContent } from './aiClient.js';
import { initDefaultTools, listTools } from './engine/toolRegistry.js';
import { executeToolLoop } from './engine/toolExecutor.js';

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
import { loadModelsConfig, ModelsFile, isLocalModel } from './modelsStore.js';
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

  const apiKeyGuide = `\n\n---\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型，端点填 http://localhost:11434/v1\n4. 无需 API Key，直接开始对话`;

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
    return '**API Key 配置指南**\n\n要启用真正的 AI 对话功能，需要配置 API Key：\n\n1. **选择服务商**（推荐）：\n   - DeepSeek：https://platform.deepseek.com（性价比高，中文优秀）\n   - 通义千问：https://dashscope.aliyun.com（国内稳定）\n   - SiliconFlow：https://siliconflow.cn（有免费额度）\n\n2. **获取 API Key**：在对应平台注册账号并创建 API Key\n\n3. **配置到系统**：\n   - 点击对话框底部的模型选择按钮\n   - 选择「添加模型」进行配置\n   - 填入 API Key 并保存\n\n4. **开始对话**：配置完成后即可使用真正的 AI 模型进行对话';
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
 * 判断模型是否实际可用（有 API Key 或为本地模型）
 * 用于 auto 模式选型时过滤掉不可用的模型
 */
function isModelAvailable(model: { provider?: string; apiKey?: string; apiKeys?: Array<{ key?: string; enabled?: boolean }>; apiEndpoint?: string }): boolean {
  // 本地模型不需要 API Key
  if (isLocalModel(model)) return true;
  // 有单 Key
  if (model.apiKey?.trim()) return true;
  // 有多 Key（至少一个启用且有值）
  if (model.apiKeys?.some(k => k.enabled !== false && k.key?.trim())) return true;
  return false;
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
 * 只从实际可用的模型（有 Key 或本地模型）中选择。
 *
 * @returns 选中的模型 ID + 选型原因
 */
function autoSelectModel(message: string, modelsConfig: ModelsFile): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  // 只保留实际可用的模型（有 API Key 或本地模型）
  const availableModels = enabledModels.filter(isModelAvailable);

  // 如果没有可用模型，回退到所有已启用模型（让后端报错提示用户配置 Key）
  const candidateModels = availableModels.length > 0 ? availableModels : enabledModels;

  if (candidateModels.length === 0) {
    return {
      modelId: 'gpt-4o',
      modelName: 'GPT-4o',
      reason: '无可用模型（请配置 API Key）',
      reasonType: 'default',
    };
  }

  // 优先使用配置的默认模型（如果它在可用列表中）
  const defaultModel = candidateModels.find((m) => m.id === modelsConfig.defaultModelId) || candidateModels[0];

  return {
    modelId: defaultModel.id,
    modelName: defaultModel.name,
    reason: candidateModels.length === 1 ? '唯一可用模型' : '使用默认模型',
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

/**
 * 自动记忆学习：从对话中提取关键信息，追加到 MEMORY.md
 *
 * 策略：
 * 1. 只在对话轮次 >= 3 时触发（避免首句无意义提取）
 * 2. 异步执行，不阻塞主对话流程
 * 3. 提取前读取现有记忆，避免重复
 * 4. 只追加新内容，不覆盖用户手动编写的内容
 */
async function extractAndAppendMemory(
  userMessage: string,
  assistantMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<{ updated: boolean; count: number }> {
  try {
    // 至少有一定长度的对话才提取
    if (userMessage.length < 5 || assistantMessage.length < 10) return { updated: false, count: 0 };

    const existingMemory = readMemoryMd();

    // 构建提取 prompt
    const historySummary = conversationHistory
      .slice(-6) // 最近 3 轮
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const extractPrompt = `你是一个记忆提取助手。请从以下对话中提取值得长期记住的关键信息。

## 提取规则
1. 只提取以下类型的信息：
   - 用户的偏好、习惯、喜好
   - 用户提到的个人事实（名字、角色、环境等）
   - 用户明确要求记住的指令或规则
   - 重要的项目上下文（技术栈、配置、约定）
2. 不要提取：
   - 临时性问题（如"今天天气怎么样"）
   - 已经在现有记忆中存在的重复信息
   - 对话中的闲聊、客套
   - AI 助手自己的回复内容
3. 每条记忆用一行简洁的 Markdown 格式表示
4. 如果没有值得记住的新信息，返回空字符串

## 现有记忆
${existingMemory || '（无现有记忆）'}

## 最近对话
${historySummary}

## 本次对话
用户: ${userMessage.slice(0, 500)}
助手: ${assistantMessage.slice(0, 500)}

请只输出提取到的记忆条目，每条一行。如果没有新信息，输出空字符串。不要输出任何解释。`;

    // 使用当前可用的模型进行提取
    const modelsConfig = await loadModelsConfig();
    const availableModels = modelsConfig.models.filter((m) => m.enabled);
    const targetModel = availableModels[0];

    if (!targetModel) {
      console.log('[AutoMemory] 无可用模型，跳过记忆提取');
      return { updated: false, count: 0 };
    }

    const keyResult = selectKey(targetModel);
    const effectiveApiKey = keyResult ? keyResult.key : undefined;

    if (!effectiveApiKey && !isLocalModel(targetModel)) {
      console.log('[AutoMemory] 无可用 API Key，跳过记忆提取');
      return { updated: false, count: 0 };
    }

    // 调用 AI 进行提取（非流式）
    const extractMessages: Array<{ role: string; content: string }> = [
      { role: 'system', content: '你是一个精确的记忆提取助手。只输出提取到的记忆条目，不要输出任何解释或格式标记。' },
      { role: 'user', content: extractPrompt },
    ];

    const extractedContent = await callAIModel(
      {
        id: targetModel.id,
        provider: targetModel.provider || '',
        apiEndpoint: targetModel.apiEndpoint,
        apiKey: effectiveApiKey,
        maxTokens: 512,
        temperature: 0.3,
      },
      extractMessages,
    );

    if (!extractedContent?.trim()) {
      console.log('[AutoMemory] 未提取到新记忆');
      return { updated: false, count: 0 };
    }

    // 清理提取结果：去除可能的 markdown 标记
    const cleanedExtraction = extractedContent
      .trim()
      .split('\n')
      .map((line) => line.replace(/^[-*]\s*/, '').replace(/^#+\s*/, '').trim())
      .filter((line) => line.length > 3 && line.length < 200)
      .join('\n');

    if (!cleanedExtraction) {
      console.log('[AutoMemory] 清理后无有效记忆');
      return { updated: false, count: 0 };
    }

    // 去重：检查每条新记忆是否已存在于现有记忆中
    const existingLines = new Set(
      existingMemory.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean),
    );
    const newLines = cleanedExtraction
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3 && !existingLines.has(l.toLowerCase()));

    if (newLines.length === 0) {
      console.log('[AutoMemory] 所有提取的记忆已存在，跳过');
      return { updated: false, count: 0 };
    }

    // 追加到 MEMORY.md
    const timestamp = new Date().toLocaleString('zh-CN');
    const newSection = `\n## 自动学习 (${timestamp})\n${newLines.map((l) => `- ${l}`).join('\n')}\n`;
    const updatedMemory = existingMemory
      ? existingMemory.trimEnd() + '\n' + newSection
      : `# AI 记忆 (MEMORY.md)\n\n本文件由 AI 自动学习和用户手动编辑共同维护。\n${newSection}`;

    writeMemoryMd(updatedMemory);
    console.log(`[AutoMemory] 成功追加 ${newLines.length} 条记忆`);
    return { updated: true, count: newLines.length };
  } catch (e) {
    // 记忆提取失败不应影响主对话流程
    console.error('[AutoMemory] 提取失败:', e instanceof Error ? e.message : e);
    return { updated: false, count: 0 };
  }
}

const app = express();
// CORS 收紧：仅允许本地访问（开发服务器 + PyWebView 桌面壳）
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:9988',
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json({ limit: '3mb' }));

// ===================== File Upload (multipart/form-data) =====================

const UPLOADS_DIR = path.join(CDF_KNOW_CLOW_DIR, 'uploads');

/** 确保上传目录存在 */
function ensureUploadsDir(): void {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

/** 允许的文件扩展名 */
const ALLOWED_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'tiff', 'avif',
  'pdf', 'csv', 'txt', 'json', 'md', 'xlsx', 'docx',
]);

/** 最大文件大小：10MB */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * 轻量级 multipart/form-data 解析器（无外部依赖）
 * 仅解析单文件上传（field name: 'file'）
 */
function parseMultipartFormData(
  req: express.Request,
): Promise<{ fileName: string; mimeType: string; data: Buffer } | null> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return resolve(null);
    }

    // 从 Content-Type 提取 boundary
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^\s;]+))/);
    if (!boundaryMatch) {
      return reject(new Error('Missing boundary in Content-Type'));
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const delimiter = Buffer.from(`--${boundary}`);
    const endDelimiter = Buffer.from(`--${boundary}--`);

    const chunks: Buffer[] = [];
    let totalSize = 0;
    let foundFile = false;
    let fileData: Buffer[] = [];
    let fileTotalSize = 0;
    let parsedFileName = 'upload';
    let parsedMimeType = 'application/octet-stream';

    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > MAX_UPLOAD_SIZE * 1.5) {
        req.destroy(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);

        // 查找文件部分
        let pos = 0;
        while (pos < body.length) {
          // 查找 delimiter
          const delimIdx = body.indexOf(delimiter, pos);
          if (delimIdx === -1) break;

          // 跳过 delimiter + \r\n
          let headerEnd = body.indexOf('\r\n\r\n', delimIdx + delimiter.length);
          if (headerEnd === -1) break;

          const headerSection = body.subarray(delimIdx + delimiter.length, headerEnd).toString();
          headerEnd += 4; // 跳过 \r\n\r\n

          // 查找下一个 delimiter（即当前 part 的结束位置）
          const nextDelim = body.indexOf(delimiter, headerEnd);
          if (nextDelim === -1) break;

          // part 数据（去掉末尾的 \r\n）
          let partEnd = nextDelim;
          if (body[partEnd - 1] === 0x0a && body[partEnd - 2] === 0x0d) {
            partEnd -= 2;
          }

          // 解析 Content-Disposition
          if (headerSection.includes('name="file"') || headerSection.includes('name="file"')) {
            // 提取 filename
            const fnMatch = headerSection.match(/filename="([^"]*)"/);
            if (fnMatch) parsedFileName = fnMatch[1];

            // 提取 Content-Type
            const ctMatch = headerSection.match(/Content-Type:\s*([^\r\n]+)/i);
            if (ctMatch) parsedMimeType = ctMatch[1].trim();

            fileData.push(body.subarray(headerEnd, partEnd));
            fileTotalSize += partEnd - headerEnd;
            foundFile = true;
          }

          pos = nextDelim + delimiter.length;
          // 检查是否是结束标记
          if (body.subarray(pos, pos + 2).equals(Buffer.from('--'))) break;
        }

        if (foundFile && fileTotalSize <= MAX_UPLOAD_SIZE) {
          resolve({
            fileName: parsedFileName,
            mimeType: parsedMimeType,
            data: Buffer.concat(fileData),
          });
        } else if (foundFile && fileTotalSize > MAX_UPLOAD_SIZE) {
          reject(new Error('File too large (max 10MB)'));
        } else {
          resolve(null);
        }
      } catch (e) {
        reject(e);
      }
    });

    req.on('error', reject);
  });
}

// 静态文件服务：提供已上传文件的访问
ensureUploadsDir();
app.use('/api/uploads', express.static(UPLOADS_DIR));

// POST /api/upload — 文件上传接口
app.post('/api/upload', async (req, res) => {
  try {
    const parsed = await parseMultipartFormData(req);
    if (!parsed) {
      return res.status(400).json({ error: '未找到文件或请求格式错误' });
    }

    const { fileName, mimeType, data } = parsed;

    // 验证文件类型
    const ext = path.extname(fileName).toLowerCase().replace('.', '');
    const isImage = mimeType.startsWith('image/');
    if (!isImage && !ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `不支持的文件类型: ${ext}` });
    }

    // 验证文件大小
    if (data.length > MAX_UPLOAD_SIZE) {
      return res.status(400).json({ error: '文件大小超过 10MB 限制' });
    }

    // 生成唯一文件名
    const fileId = uuidv4();
    const safeExt = ext || (isImage ? 'png' : 'bin');
    const savedFileName = `${fileId}.${safeExt}`;
    const filePath = path.join(UPLOADS_DIR, savedFileName);

    // 保存文件
    fs.writeFileSync(filePath, data);

    const result = {
      fileId,
      fileName,
      filePath,
      mimeType,
      size: data.length,
      url: `/api/uploads/${savedFileName}`,
    };

    console.log(`[Upload] 文件已保存: ${fileName} (${(data.length / 1024).toFixed(1)}KB) -> ${savedFileName}`);
    res.json({ data: result });
  } catch (error) {
    console.error('[Upload] 上传失败:', error);
    const msg = error instanceof Error ? error.message : '上传失败';
    res.status(500).json({ error: msg });
  }
});

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

// 更新会话标题
app.patch('/api/sessions/:id', (req, res) => {
  const { title } = req.body;
  if (!title) {
    return res.status(400).json({ error: 'title is required' });
  }
  const db = initDb();
  db.prepare('UPDATE sessions SET title = ?, updatedAt = ? WHERE id = ?').run(title, new Date().toISOString(), req.params.id);
  res.json({ ok: true });
});

// 发送消息（SSE）
app.post('/api/chat', async (req, res) => {
  const { sessionId, message, model = 'auto', skillContext, skillId, preset, conversationHistory, attachments } = req.body;
  console.log(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, message="${message?.slice(0, 30)}"`);
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    console.log(`[Chat API] 附件数量: ${attachments.length}`);
  }

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
      // Thinking 跟踪
      let thinkingStartTime: number | null = null;
      let hasThinking = false;
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
      const apiMessages: Array<{ role: string; content: MessageContent }> = [];

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

      // 添加当前用户消息（含附件处理）
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        // 构建 OpenAI Vision 格式的 content 数组
        const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];

        // 添加文本内容
        contentParts.push({ type: 'text', text: message });

        // 处理附件
        for (const att of attachments) {
          if (att.type === 'image') {
            // 图片：读取文件并转为 base64 data URL
            try {
              const filePath = path.join(UPLOADS_DIR, path.basename(att.url));
              if (fs.existsSync(filePath)) {
                const fileBuffer = fs.readFileSync(filePath);
                const base64 = fileBuffer.toString('base64');
                contentParts.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${att.mimeType};base64,${base64}`,
                    detail: 'auto',
                  },
                });
              }
            } catch (err) {
              console.error(`[Chat API] 读取图片附件失败: ${att.fileName}`, err);
            }
          } else {
            // 文件：读取内容并作为文本注入
            try {
              const filePath = path.join(UPLOADS_DIR, path.basename(att.url));
              if (fs.existsSync(filePath)) {
                const ext = path.extname(att.fileName).toLowerCase().replace('.', '');
                // 仅对文本类文件读取内容
                if (['txt', 'csv', 'json', 'md'].includes(ext)) {
                  const fileContent = fs.readFileSync(filePath, 'utf-8');
                  const truncated = fileContent.length > 50000
                    ? fileContent.slice(0, 50000) + '\n\n... (文件内容已截断)'
                    : fileContent;
                  contentParts.push({
                    type: 'text',
                    text: `\n---\n[附件: ${att.fileName}]\n${truncated}\n---\n`,
                  });
                } else {
                  contentParts.push({
                    type: 'text',
                    text: `\n---\n[附件: ${att.fileName} (${(att.size / 1024).toFixed(1)}KB, ${att.mimeType})]\n注: 此文件类型暂不支持内容预览\n---\n`,
                  });
                }
              }
            } catch (err) {
              console.error(`[Chat API] 读取文件附件失败: ${att.fileName}`, err);
              contentParts.push({
                type: 'text',
                text: `\n---\n[附件: ${att.fileName} - 读取失败]\n---\n`,
              });
            }
          }
        }

        apiMessages.push({ role: 'user', content: contentParts });
      } else {
        apiMessages.push({ role: 'user', content: message });
      }

      // 合并模型配置和预设参数
      const finalModelConfig = {
        ...modelConfig,
        apiKey: effectiveApiKey,
        temperature: activePreset ? activePreset.temperature : modelConfig.temperature,
        topP: activePreset ? activePreset.topP : modelConfig.topP,
      };

      // 创建 AbortController 用于超时控制
      const abortController = new AbortController();
      // 本地模型给更长的超时（大模型推理可能较慢）
      const timeoutMs = isLocalModel(modelConfig) ? 300000 : 120000;
      const timeout = setTimeout(() => abortController.abort(), timeoutMs);

      try {
        // 无 API Key 且非本地模型时使用模拟模式
        if (!effectiveApiKey && !isLocalModel(modelConfig)) {
          console.log(`[Chat API] 模型 ${effectiveModel} 未配置 API Key，使用模拟模式`);
          const mockResponse = generateMockResponse(message);
          const segments = mockResponse.match(/[\s\S]{1,5}/g) || [mockResponse];
          for (const segment of segments) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: segment })}\n\n`);
            await new Promise(r => setTimeout(r, 15));
          }
          fullContent = mockResponse;
        } else {
          // v1.9.0: 使用 Tool Calling 循环
          fullContent = await executeToolLoop({
            modelConfig: finalModelConfig,
            messages: apiMessages,
            maxToolTurns: 10,
            signal: abortController.signal,
            onChunk: (chunk) => {
              res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            },
            onThinking: (thinkingChunk) => {
              if (!hasThinking) {
                hasThinking = true;
                thinkingStartTime = Date.now();
              }
              res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`);
            },
            onToolCall: (toolCall, result) => {
              // 发送 tool_call 事件到前端（用于展示工具调用过程）
              res.write(`data: ${JSON.stringify({
                type: 'tool_call',
                toolName: toolCall.function.name,
                toolArgs: toolCall.function.arguments,
                toolResult: result,
              })}\n\n`);
            },
          });
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

      // 异步自动记忆学习（不阻塞主流程，不 await）
      extractAndAppendMemory(message, fullContent, apiMessages).catch(() => {});
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
          thinkingDuration: 0,
        })}\n\n`);
        res.end();
      } catch {
        // 响应流可能已关闭，忽略
      }
      return;
    }

    // 正常完成：发送 done 事件
    try {
      const thinkingDuration = (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0;
      res.write(`data: ${JSON.stringify({
        type: 'done',
        errorCode: null,
        errorMessage: null,
        thinkingDuration,
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
const server = app.listen(PORT, async () => {
  console.log(`CDF Know Clow Chat Server running on port ${PORT}`);
  const db = initDb();

  // 初始化 Tool Registry
  await initDefaultTools();
  console.log('[Tool Registry] 工具注册完成:', listTools().join(', '));

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
