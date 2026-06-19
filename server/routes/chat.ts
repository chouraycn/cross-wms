import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { promises as fsp } from 'fs';
import os from 'os';
import { EventEmitter } from 'events';
// 动态 require（用于可选依赖 pdf-parse/mammoth/xlsx）
// CJS 环境（tsc 编译后）直接用 require()；ESM 环境（tsx 运行时）需要 createRequire
// tsc 编译目标为 "commonjs"，编译后 import/createRequire 会被转换成普通 require()
// 为了通过 TypeScript 类型检查，声明 require 函数（CJS 环境全局可用）
declare function require(id: string): any;
import { callAIModel, AIAPIError } from '../aiClient.js';
import type { MessageContent, ModelCallConfig } from '../aiClient.js';
import { executeToolLoop, getToolRiskLevel } from '../engine/toolExecutor.js';
import { ExecutionStrategyFactory, ExecutionMode } from '../engine/executionStrategy.js';
import type { ExecutionStrategyOptions } from '../engine/executionStrategy.js';
import { buildSoulSystemMessage } from '../engine/soulLoader.js';
import { estimateMessagesTokens, truncateContextForModel, sanitizeToolMessages } from '../engine/contextTruncate.js';
import { compressContextWithSummary } from '../engine/contextCompress.js';
import { loadModelsConfig, ModelsFile, isLocalModel } from '../modelsStore.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import {
  getSessions,
  createSession,
  getSessionMessages,
  addMessage,
} from '../dao/chat.js';
import { getAppSettings, setAppSettings } from '../dao/settings.js';
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { messageQueue, type QueueMode, type QueueEvent } from '../engine/messageQueue.js';
import { writeMemory, searchMemory, extractKeywords, type VecSearchResult } from '../engine/vecMemoryStore.js';
import { logger } from '../logger.js';

// MEMORY.md 路径
const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');
const MEMORY_MD_PATH = path.join(CDF_KNOW_CLOW_DIR, 'MEMORY.md');

// v2.8.2: 记忆提取 LLM 调用节流 — 避免短时间内频繁调用 LLM 浪费资源
const MEMORY_EXTRACT_COOLDOWN_MS = 60_000; // 60s 冷却期
let lastMemoryExtractTime = 0;
let lastMemoryExtractMsgHash = '';

// v2.8.2: 简易 hash — 用于检测相同/相似用户消息，跳过重复提取
function quickHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

// v2.8.2: Pre-LLM 启发式 — 检测对话是否以工具输出为主（不值得提取记忆）
function isToolOutputDominant(assistantMessage: string): boolean {
  // 工具输出特征：高密度的 JSON 标点、路径、日志标记
  const toolMarkers = (assistantMessage.match(/[{}[\]":,\\/]/g) || []).length;
  const punctRatio = assistantMessage.length > 0 ? toolMarkers / assistantMessage.length : 0;
  // 标点密度 > 15% 且消息长度 > 200 → 很可能是工具输出
  if (punctRatio > 0.15 && assistantMessage.length > 200) return true;
  // 检查典型工具输出开头模式
  if (/^(执行|工具|结果|输出|成功|失败|错误|Error|Result|Output)/.test(assistantMessage.trim())) return true;
  return false;
}

// v1.9.2: 工具权限请求全局 EventEmitter
export const permissionEmitter = new EventEmitter();

// v2.3.3: reqId → { toolName, sessionId } 映射，用于持久化 "始终允许"
const reqIdToolMap = new Map<string, { toolName: string; sessionId: string }>();

// v1.9.6: Session 级工具授权缓存 — 同一会话内，工具授权一次后不再重复授权
// key 为 sessionId，value 为该 session 已授权的工具名称集合
const sessionApprovedToolsCache = new Map<string, Set<string>>();

// v2.3.3: 全局始终允许的工具集合（持久化到 DB，跨会话）
let globalAlwaysAllowed: Set<string> | null = null;

// v7.0: 消息队列事件监听 — 将队列状态变化推送到活跃 SSE 连接
const activeSSEConnections = new Map<string, { res: import('express').Response; assistantMessageId: string }>();

messageQueue.on('queue', (event: QueueEvent) => {
  // 将队列事件转发到对应的 SSE 连接
  const conn = activeSSEConnections.get(event.sessionId);
  if (conn && !conn.res.writableEnded) {
    try {
      conn.res.write(`data: ${JSON.stringify({
        ...event,
        type: 'queue_event',
      })}\n\n`);
    } catch {
      // SSE 连接可能已关闭
    }
  }
});

/** v2.3.3: 加载全局始终允许的工具列表 */
function loadAlwaysAllowedTools(): Set<string> {
  if (globalAlwaysAllowed) return globalAlwaysAllowed;
  try {
    const val = getAppSettings('always_allowed_tools');
    globalAlwaysAllowed = val ? new Set(JSON.parse(val)) : new Set();
  } catch {
    globalAlwaysAllowed = new Set();
  }
  return globalAlwaysAllowed;
}

/** v2.5.0: 检查工具是否在始终允许列表中（支持通配符前缀匹配 mcp__server__* 等） */
function isToolAlwaysAllowed(toolName: string): boolean {
  const allowed = loadAlwaysAllowedTools();
  if (allowed.has(toolName)) return true;
  // 通配符匹配：检查是否有 `prefix*` 模式匹配
  for (const pattern of allowed) {
    if (pattern.endsWith('*') && toolName.startsWith(pattern.slice(0, -1))) {
      return true;
    }
  }
  return false;
}

/** v1.5.66: 检查系统授权是否已启用 */
function isSystemAuthorized(): boolean {
  try {
    const val = getAppSettings('systemAuthorization');
    if (!val) return false;
    const config = JSON.parse(val);
    return config.enabled === true;
  } catch {
    return false;
  }
}

// v2.2.0: Thinking 结果缓存（LRU，最多 50 条，TTL 10 分钟）
const thinkingCache = new Map<string, { content: string; thinking: string; timestamp: number }>();
const THINKING_CACHE_MAX = 50;
const THINKING_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

function getThinkingCacheKey(model: string, message: string, effort: string): string {
  // 简单 hash
  const str = `${model}:${message}:${effort}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

function getThinkingCache(key: string): { content: string; thinking: string } | null {
  const entry = thinkingCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > THINKING_CACHE_TTL) {
    thinkingCache.delete(key);
    return null;
  }
  return { content: entry.content, thinking: entry.thinking };
}

function setThinkingCache(key: string, content: string, thinking: string): void {
  if (thinkingCache.size >= THINKING_CACHE_MAX) {
    // 删除最旧的
    const oldest = [...thinkingCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) thinkingCache.delete(oldest[0]);
  }
  thinkingCache.set(key, { content, thinking, timestamp: Date.now() });
}

// ===================== File Content Extraction =====================

/**
 * v1.9.3: 提取文件内容，支持多种文件类型
 */
async function extractFileContent(filePath: string, ext: string, fileName: string): Promise<string> {
  const MAX_SIZE = 100000; // 100KB 文本上限

  /**
   * 生成截断提示信息
   */
  function buildTruncatedNotice(originalLen: number, truncatedLen: number, fileType: string): string {
    const originalKB = (originalLen / 1024).toFixed(1);
    const truncatedKB = (truncatedLen / 1024).toFixed(1);
    return (
      `\n\n` +
      `╔══════════════════════════════════════════════════════════════╗\n` +
      `║  ⚠️  ${fileType}内容超出限制（${originalKB}KB > ${truncatedKB}KB）          ║\n` +
      `╠══════════════════════════════════════════════════════════════╣\n` +
      `║  仅展示了前 ${truncatedKB}KB 的内容，后续部分已被截断。            ║\n` +
      `║  如需分析完整内容，建议：                                      ║\n` +
      `║    1. 将文件拆分为多个小文件后分别上传                         ║\n` +
      `║    2. 或先提取关键章节/段落，再粘贴到对话中                    ║\n` +
      `╚══════════════════════════════════════════════════════════════╝`
    );
  }

  // 纯文本文件：直接读取
  const textExts = new Set([
    'txt', 'csv', 'json', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs',
    'cpp', 'c', 'h', 'hpp', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm',
    'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1',
    'css', 'scss', 'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm', 'log', 'tsv',
    'html', 'htm',
  ]);

  if (textExts.has(ext)) {
    const content = await fsp.readFile(filePath, 'utf-8');
    const isTruncated = content.length > MAX_SIZE;
    const truncated = isTruncated
      ? content.slice(0, MAX_SIZE) + buildTruncatedNotice(content.length, MAX_SIZE, '文本文件')
      : content;
    return `\n---\n[附件: ${fileName}]\n\`\`\`${ext}\n${truncated}\n\`\`\`\n---\n`;
  }

  // PDF：尝试用 pdf-parse 提取文本
  if (ext === 'pdf') {
    try {
      const pdfParse = require('pdf-parse');
      const dataBuffer = await fsp.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      const text = pdfData.text || '';
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'PDF')
        : text;
      return `\n---\n[附件: ${fileName} (PDF, ${pdfData.numpages} 页)]\n${truncated}\n---\n`;
    } catch {
      return `\n---\n[附件: ${fileName} (PDF)]\n注: 无法提取 PDF 文本内容（请安装 pdf-parse: npm install pdf-parse）\n---\n`;
    }
  }

  // DOCX / DOC：尝试用 mammoth 提取文本（mammoth 同时支持 .docx 和 .doc）
  if (ext === 'docx' || ext === 'doc') {
    try {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value || '';
      const warnings = result.messages || [];
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'Word 文档')
        : text;
      const warningNote = warnings.length > 0
        ? `\n⚠️ 提取警告: ${warnings.map((w: { message: string }) => w.message).join('; ')}\n`
        : '';
      return `\n---\n[附件: ${fileName} (Word 文档)]\n${warningNote}${truncated}\n---\n`;
    } catch {
      const formatLabel = ext === 'doc' ? 'DOC (旧版 Word)' : 'DOCX (新版 Word)';
      return `\n---\n[附件: ${fileName} (${formatLabel})]\n注: 无法提取 Word 文档文本内容（请安装 mammoth: npm install mammoth）\n---\n`;
    }
  }

  // XLSX：尝试用 xlsx 提取文本
  if (ext === 'xlsx') {
    try {
      const xlsx = require('@e965/xlsx');
      const workbook = xlsx.readFile(filePath);
      let text = '';
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const csv = xlsx.utils.sheet_to_csv(sheet);
        text += `\n=== 工作表: ${sheetName} ===\n${csv}\n`;
      }
      const isTruncated = text.length > MAX_SIZE;
      const truncated = isTruncated
        ? text.slice(0, MAX_SIZE) + buildTruncatedNotice(text.length, MAX_SIZE, 'Excel 表格')
        : text;
      return `\n---\n[附件: ${fileName} (Excel 表格)]\n${truncated}\n---\n`;
    } catch {
      return `\n---\n[附件: ${fileName} (XLSX)]\n注: 无法提取 Excel 表格内容（请安装 xlsx: npm install xlsx）\n---\n`;
    }
  }

  // PPTX：尝试用 pptx-parser 或提示用户
  if (ext === 'pptx') {
    return `\n---\n[附件: ${fileName} (PPT 演示文稿)]\n注: PPT 文件暂不支持内容提取，请转换为 PDF 后上传\n---\n`;
  }

  // 未知类型：返回文件信息
  const stats = await fsp.stat(filePath);
  return `\n---\n[附件: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)]\n注: 此文件类型暂不支持内容预览\n---\n`;
}

// ===================== Auto Model Selection =====================

/**
 * 生成模拟响应（当未配置 API Key 时使用）
 */
export function generateMockResponse(userMessage: string): string {
  const msg = userMessage.toLowerCase();

  const apiKeyGuide = `\n\n---\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话`;

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
    return '**API Key 配置指南**\n\n💡 **启用真正的 AI 对话**\n\n点击对话框底部的模型选择按钮，选择「添加模型」进行配置。\n\n**方案一：配置 API Key（推荐）**\n1. 选择一个模型（推荐 DeepSeek 或通义千问，性价比高）\n2. 填入对应服务商的 API Key\n3. 保存后即可开始真正的 AI 对话\n\n**方案二：使用本地模型（免 Key）**\n1. 安装 [Ollama](https://ollama.com) 并启动服务（ollama serve）\n2. 拉取模型：ollama pull llama3.1\n3. 添加 Ollama 模型\n4. 无需 API Key，直接开始对话';
  }

  return `收到你的消息：「${userMessage}」\n\n（模拟模式）这是一个预设的演示响应。配置 API Key 后，我将连接真正的 AI 模型为你提供智能、准确的回答。` + apiKeyGuide;
}

/** Auto 选型结果 */
export interface AutoSelectResult {
  modelId: string;
  modelName: string;
  /** 选型原因中文描述 */
  reason: string;
  /** 选型原因类型标签 */
  reasonType: 'code' | 'complex' | 'simple' | 'longContext' | 'default' | 'vision';
}

/**
 * 判断模型是否实际可用（有 API Key 或为本地模型）
 * 用于 auto 模式选型时过滤掉不可用的模型
 */
export function isModelAvailable(model: { provider?: string; apiKey?: string; apiKeys?: Array<{ key?: string; enabled?: boolean }>; apiEndpoint?: string }): boolean {
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
export function autoSelectModel(message: string, modelsConfig: ModelsFile, hasImageAttachment = false): AutoSelectResult {
  const enabledModels = modelsConfig.models.filter((m) => m.enabled);
  // 只保留实际可用的模型（有 API Key 或本地模型）
  const availableModels = enabledModels.filter(isModelAvailable);

  // 如果没有可用模型，回退到所有已启用模型（让后端报错提示用户配置 Key）
  const candidateModels = availableModels.length > 0 ? availableModels : enabledModels;

  if (candidateModels.length === 0) {
    // 尝试使用默认模型配置
    const defaultModel = modelsConfig.models.find(m => m.id === modelsConfig.defaultModelId && m.enabled !== false);
    if (defaultModel) {
      return {
        modelId: defaultModel.id,
        modelName: defaultModel.name || defaultModel.id,
        reason: '无可用模型，使用默认模型',
        reasonType: 'default',
      };
    }
    // 最后回退：取配置文件中的第一个已启用模型
    const firstEnabled = modelsConfig.models.find(m => m.enabled !== false);
    if (firstEnabled) {
      return {
        modelId: firstEnabled.id,
        modelName: firstEnabled.name || firstEnabled.id,
        reason: '无可用模型，使用第一个已启用模型',
        reasonType: 'default',
      };
    }
    // 完全无可用模型：抛出明确错误
    throw Object.assign(
      new Error('无可用模型：请先前往"设置 → 模型管理"启用至少一个模型并配置 API Key'),
      { code: 'NO_AVAILABLE_MODELS' }
    );
  }

  // v1.9.3: 如果有图片附件，优先选择支持多模态的模型
  if (hasImageAttachment) {
    const visionModels = candidateModels.filter(m => {
      const isMultimodal = m.capabilities?.includes('multimodal');
      const isKnownVisionModel = [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
        'qwen-vl', 'qwen-vl-max',
        'kimi-k2.6', 'kimi-k2.5',
      ].some(id => m.id.toLowerCase().includes(id.toLowerCase()));
      // ⚠️ DeepSeek API 不支持 image_url 格式，即使有 multimodal 标签也排除
      const isFalsePositiveVision = /deepseek/i.test(m.id);
      return (isMultimodal || isKnownVisionModel) && !isFalsePositiveVision;
    });
    if (visionModels.length > 0) {
      const defaultVision = visionModels.find(m => m.id === modelsConfig.defaultModelId) || visionModels[0];
      return {
        modelId: defaultVision.id,
        modelName: defaultVision.name,
        reason: candidateModels.length === 1 ? '唯一可用模型' : '支持图片理解',
        reasonType: 'vision',
      };
    }
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
export const MODEL_PRESETS: Record<string, { temperature: number; topP: number; label: string; description: string }> = {
  creative: { temperature: 1.3, topP: 0.95, label: '创意写作', description: '高温度，适合创意、头脑风暴' },
  code:     { temperature: 0.2, topP: 0.8,  label: '代码生成', description: '低温度，确保代码准确性' },
  translate:{ temperature: 0.3, topP: 0.85, label: '翻译', description: '适中温度，保持翻译一致性' },
  analysis: { temperature: 0.5, topP: 0.9, label: '分析推理', description: '平衡温度，适合逻辑分析' },
  precise:  { temperature: 0.1, topP: 0.7, label: '精确问答', description: '极低温度，追求事实准确性' },
};

/** 读取 MEMORY.md 内容，不存在则返回空字符串 */
export async function readMemoryMd(): Promise<string> {
  try {
    return await fsp.readFile(MEMORY_MD_PATH, 'utf-8');
  } catch (e: any) {
    if (e.code !== 'ENOENT') {
      logger.error('[Memory] 读取失败:', e);
    }
  }
  return '';
}

/** 写入 MEMORY.md 内容（异步，不阻塞事件循环） */
export async function writeMemoryMd(content: string): Promise<void> {
  try {
    // v2.8.2: 异步 mkdir — recursive 选项保证幂等，无需 existsSync 预检查
    await fsp.mkdir(CDF_KNOW_CLOW_DIR, { recursive: true });
    await fsp.writeFile(MEMORY_MD_PATH, content, 'utf-8');
  } catch (e) {
    logger.error('[Memory] 写入失败:', e);
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
 * 5. v2.8.2: 60s 冷却期 + 消息 hash 去重 — 避免短时间内重复 LLM 调用
 * 6. v2.8.2: Pre-LLM 启发式过滤 — 工具输出为主的对话直接跳过，节省 LLM 调用
 * 7. v2.8.2: 全异步文件 I/O — readMemoryMd/writeMemoryMd 均使用 fsp API
 */
export async function extractAndAppendMemory(
  userMessage: string,
  assistantMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
): Promise<{ updated: boolean; count: number }> {
  try {
    // v1.5.132: 提高最小对话长度阈值，避免短对话产生噪音记忆
    if (userMessage.length < 10 || assistantMessage.length < 20) return { updated: false, count: 0 };

    // v1.5.132: 至少需要 3 轮对话才触发记忆提取
    if (conversationHistory.length < 4) return { updated: false, count: 0 };

    // v2.8.2: 冷却期检查 — 60s 内不重复调用 LLM
    const now = Date.now();
    if (now - lastMemoryExtractTime < MEMORY_EXTRACT_COOLDOWN_MS) {
      logger.debug('[AutoMemory] 冷却期内，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: 用户消息去重 — 相同/高度相似的消息跳过
    const msgHash = quickHash(userMessage.slice(0, 200));
    if (msgHash === lastMemoryExtractMsgHash) {
      logger.debug('[AutoMemory] 用户消息与上次相同，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: Pre-LLM 启发式 — 工具输出为主的对话不值得提取
    if (isToolOutputDominant(assistantMessage)) {
      logger.debug('[AutoMemory] 助手回复以工具输出为主，跳过提取');
      return { updated: false, count: 0 };
    }

    // v2.8.2: 更新冷却时间戳和消息 hash（在 LLM 调用前设置，防止并发重复）
    lastMemoryExtractTime = now;
    lastMemoryExtractMsgHash = msgHash;

    const existingMemory = await readMemoryMd();

    // 构建提取 prompt
    const historySummary = conversationHistory
      .slice(-6) // 最近 3 轮
      .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 200)}`)
      .join('\n');

    const extractPrompt = `你是一个记忆提取助手。请从以下对话中提取值得长期记住的关键信息。\n\n## 提取规则\n1. 只提取以下类型的信息：\n   - 用户的偏好、习惯、喜好\n   - 用户提到的个人事实（名字、角色、环境等）\n   - 用户明确要求记住的指令或规则\n   - 重要的项目上下文（技术栈、配置、约定）\n2. 严禁提取：\n   - 工具执行的输出结果、文件内容、代码片段\n   - 文件路径、URL、命令行输出\n   - 临时性问题（如"今天天气怎么样"）\n   - 已经在现有记忆中存在的重复信息\n   - 对话中的闲聊、客套\n   - AI 助手自己的回复内容\n   - JSON 数据、日志输出、堆栈跟踪\n3. 每条记忆用一行简洁的中文描述，10-100 字\n4. 如果没有值得记住的新信息，返回空字符串\n5. 宁可少提取，也不要提取噪音信息\n\n## 现有记忆\n${existingMemory || '（无现有记忆）'}\n\n## 最近对话\n${historySummary}\n\n## 本次对话\n用户: ${userMessage.slice(0, 500)}\n助手: ${assistantMessage.slice(0, 500)}\n\n请只输出提取到的记忆条目，每条一行。如果没有新信息，输出空字符串。不要输出任何解释。`;

    // 使用当前可用的模型进行提取
    const modelsConfig = await loadModelsConfig();
    const availableModels = modelsConfig.models.filter((m) => m.enabled);
    const targetModel = availableModels[0];

    if (!targetModel) {
      logger.debug('[AutoMemory] 无可用模型，跳过记忆提取');
      return { updated: false, count: 0 };
    }

    const keyResult = selectKey(targetModel);
    const effectiveApiKey = keyResult ? keyResult.key : undefined;

    if (!effectiveApiKey && !isLocalModel(targetModel)) {
      logger.debug('[AutoMemory] 无可用 API Key，跳过记忆提取');
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
      logger.debug('[AutoMemory] 未提取到新记忆');
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
      logger.debug('[AutoMemory] 清理后无有效记忆');
      return { updated: false, count: 0 };
    }

    // v1.5.132: 噪音过滤 — 过滤掉工具输出、文件路径、JSON 等非语义记忆
    const NOISE_PATTERNS = [
      /^(\/|\.\/|~\/|C:\\)/,          // 文件路径
      /^\s*[{[]/,                      // JSON/数组开头
      /^\s*(error|warn|info|debug)\b/i, // 日志级别
      /^\s*(git|npm|yarn|pnpm|npx|pip|python|node|bash|sh)\s/, // 命令行
      /^\s*(import|export|const|let|var|function|class)\s/, // 代码
      /^\s*\d{4}-\d{2}-\d{2}/,         // 日期开头
      /^\s*<(html|head|body|div|span|script|style)/, // HTML 标签
      /^\s*(http|https|ftp):\/\//,     // URL
      /^\s*\[.{50,}\]/,                // 长数组/工具调用结果
      /[{}]{3,}/,                      // 多层 JSON 嵌套
    ];

    const isNoise = (line: string): boolean => {
      // 过短或过长
      if (line.length < 8 || line.length > 150) return true;
      // 匹配噪音模式
      for (const pattern of NOISE_PATTERNS) {
        if (pattern.test(line)) return true;
      }
      // 包含大量标点（工具输出特征）
      const punctCount = (line.match(/[{}[\]":,\\/]/g) || []).length;
      if (punctCount > line.length * 0.2) return true;
      return false;
    };

    // 去重：检查每条新记忆是否已存在于现有记忆中
    const existingLines = new Set(
      existingMemory.split('\n').map((l) => l.trim().toLowerCase()).filter(Boolean),
    );
    const newLines = cleanedExtraction
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 3 && !existingLines.has(l.toLowerCase()))
      .filter((l) => !isNoise(l)); // v1.5.132: 噪音过滤

    if (newLines.length === 0) {
      logger.debug('[AutoMemory] 过滤后无有效记忆（可能均为噪音）');
      return { updated: false, count: 0 };
    }

    // 追加到 MEMORY.md
    const timestamp = new Date().toLocaleString('zh-CN');
    const newSection = `\n## 自动学习 (${timestamp})\n${newLines.map((l) => `- ${l}`).join('\n')}\n`;
    const updatedMemory = existingMemory
      ? existingMemory.trimEnd() + '\n' + newSection
      : `# AI 记忆 (MEMORY.md)\n\n本文件由 AI 自动学习和用户手动编辑共同维护。\n${newSection}`;

    await writeMemoryMd(updatedMemory);
    logger.debug(`[AutoMemory] 成功追加 ${newLines.length} 条记忆`);

    // 同步写入 vecMemoryStore（向量语义索引）
    // 使用 extractKeywords 提取关键词，提升降级搜索准确率
    for (const line of newLines) {
      try {
        await writeMemory({
          userId: 'default',
          sessionId: 'auto-memory',
          category: 'insight',
          content: line,
          keywords: extractKeywords(`${userMessage} ${line}`, 10),
        });
      } catch (e) {
        logger.error('[Memory] Failed to store to vecMemoryStore:', e);
      }
    }

    return { updated: true, count: newLines.length };
  } catch (e) {
    // 记忆提取失败不应影响主对话流程
    logger.error('[AutoMemory] 提取失败:', e instanceof Error ? e.message : e);
    return { updated: false, count: 0 };
  }
}

const router = Router();

// ===================== v7.0: 队列模式执行函数 =====================

interface QueueExecuteParams {
  model: string;
  modelName: string;
  assistantId: string;
  preset: typeof MODEL_PRESETS[string] | null;
  reasoningEffort?: string;
  executionMode?: string;
  conversationHistory?: any[];
  skillContext?: string;
  skillId?: string;
  attachments?: any[];
  autoReason?: string;
  autoReasonType?: string;
  message: string;
  modelsConfig: ModelsFile;
  sessionApprovedSet: Set<string>;
}

/**
 * 从队列执行消息 — 复用 chat route 的核心执行逻辑
 *
 * 当消息从 MessageQueue 出队时，此函数被调用。
 * 它从 DB 实时读取 conversationHistory（而非前端快照），
 * 执行策略，并通过 SSE 推送结果。
 */
async function executeFromQueue(
  sessionId: string,
  event: QueueEvent,
  res: import('express').Response,
  params: QueueExecuteParams,
): Promise<void> {
  logger.debug(`[MessageQueue] 执行出队消息: sessionId=${sessionId}, mode=${event.mode}, messageId=${event.messageId}`);

  // v1.5.116: 在 try 外部声明，使 catch 块内能访问
  let apiMessages: Array<Record<string, any>> = [];
  let abortController: AbortController | null = null;

  try {
    const modelConfig = params.modelsConfig.models.find(m => m.id === params.model);
    if (!modelConfig) {
      throw new Error(`未找到模型配置: ${params.model}`);
    }

    const keyResult = selectKey(modelConfig);
    let effectiveApiKey = modelConfig.apiKey || '';
    if (keyResult) {
      effectiveApiKey = keyResult.key;
    }

    const finalModelConfig = {
      ...modelConfig,
      apiKey: effectiveApiKey,
      temperature: params.preset ? params.preset.temperature : modelConfig.temperature,
      topP: params.preset ? params.preset.topP : modelConfig.topP,
    };

    // v7.0: 从 DB 实时读取会话消息构建上下文（替代前端快照）
    const dbMessages = getSessionMessages(sessionId);
    apiMessages = [];

    // v8.5: 注入人格层 system message（最前面，优先级最高）
    const soulSystemMsg = buildSoulSystemMessage();
    if (soulSystemMsg.trim()) {
      apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
    }

    // 注入 MEMORY.md（补充记忆上下文）
    const memoryContent = await readMemoryMd();
    if (memoryContent.trim()) {
      apiMessages.push({ role: 'system', content: memoryContent.trim() });
    }

    // 注入技能上下文
    if (params.skillContext?.trim()) {
      apiMessages.push({ role: 'system', content: params.skillContext.trim() });
    }

    // v7.0: 从 DB 消息构建上下文（实时，包含之前所有执行的结果）
    const isMultimodalModel = modelConfig.capabilities?.includes('multimodal');
    const isKnownVisionModel = [
      'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
      'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
      'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
      'qwen-vl', 'qwen-vl-max',
      'kimi-k2.6', 'kimi-k2.5',
    ].some(id => modelConfig.id.toLowerCase().includes(id.toLowerCase()));
    const isFalsePositiveVision = /deepseek/i.test(modelConfig.id);
    const _supportsVision = (isMultimodalModel || isKnownVisionModel) && !isFalsePositiveVision;

    for (const msg of dbMessages) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        if (msg.role === 'assistant' && msg.toolCalls) {
          try {
            const toolCalls = typeof msg.toolCalls === 'string' ? JSON.parse(msg.toolCalls) : msg.toolCalls;
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
              const callIds = toolCalls.map(() => `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
              apiMessages.push({
                role: 'assistant',
                content: msg.content || null,
                tool_calls: toolCalls.map((tc: any, i: number) => ({
                  id: callIds[i],
                  type: 'function',
                  function: { name: tc.name, arguments: tc.arguments },
                })),
              });
              for (let i = 0; i < toolCalls.length; i++) {
                apiMessages.push({
                  role: 'tool',
                  content: toolCalls[i].result ?? "(tool result unavailable)",
                  tool_call_id: callIds[i],
                });
              }
              continue;
            }
          } catch { /* toolCalls 解析失败，按普通消息处理 */ }
        }
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }

    // 截断/压缩上下文
    const ctxWindow = (finalModelConfig as any).contextWindow || 128000;
    // v1.5.131: 截断用 maxTokens 上限 8192，避免 384K 浪费输入空间
    const ctxMaxTokens = Math.min((finalModelConfig as any).maxTokens || 8192, 8192);
    // v1.5.116: 优先尝试智能压缩，失败则降级为简单截断
    let truncated: { messages: typeof apiMessages; truncated: boolean };
    try {
      const compressResult = await compressContextWithSummary(
        apiMessages as any, ctxWindow, ctxMaxTokens, 30, finalModelConfig,
      );
      truncated = { messages: compressResult.messages as any, truncated: compressResult.truncated || compressResult.compressed };
      if (compressResult.compressed) {
        logger.debug('[Chat API] 上下文已智能压缩（非流式）');
      }
    } catch {
      truncated = truncateContextForModel(apiMessages as any, ctxWindow, ctxMaxTokens, 30);
    }

    // v1.5.176: tool_calls 消息配对校验 — 防止 API 返回 400 "insufficient tool messages"
    // OpenAI/DeepSeek 要求：assistant(tool_calls) 后必须紧跟 role=tool 消息，且每个 call_id 都要有响应
    // v1.5.184: 修复 — 只在连续 tool 消息中搜索，遇到非 tool 消息立即停止（避免生成错误顺序）
    const msgs = truncated.messages as any[];
    const fixedMessages: any[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        // 收集这个 assistant 消息的所有 tool_call_id
        const neededIds = new Set<string>();
        for (const tc of m.tool_calls) {
          if (tc.id) neededIds.add(tc.id);
        }
        // v1.5.184: 只在连续 tool 消息中搜索（遇到非 tool 消息立即停止）
        for (let j = i + 1; j < msgs.length; j++) {
          if (msgs[j].role === 'tool' && msgs[j].tool_call_id && neededIds.has(msgs[j].tool_call_id)) {
            neededIds.delete(msgs[j].tool_call_id);
            if (neededIds.size === 0) break;  // 所有 tool_call_id 都找到了，提前退出
          } else if (msgs[j].role !== 'tool') {
            break;  // 遇到非 tool 消息，停止搜索（OpenAI 要求 tool 消息必须紧跟）
          }
        }
        if (neededIds.size > 0) {
          // 缺少对应的 tool 响应消息 → 补齐空响应（插入到 assistant 后面）
          logger.warn(`[Chat API] tool_calls 配对不完整，补齐 ${neededIds.size} 条空 tool 响应: ${[...neededIds].join(', ')}`);
          fixedMessages.push(m);
          for (const missingId of neededIds) {
            fixedMessages.push({
              role: 'tool',
              content: '[工具结果未保存]',
              tool_call_id: missingId,
            });
          }
          continue;
        }
      }
      // 清理：如果出现孤立的 tool 消息（前面没有 assistant(tool_calls) 包含此 tool_call_id），跳过
      if (m.role === 'tool' && m.tool_call_id) {
        let foundParent = false;
        // 向前查找是否有 assistant(tool_calls) 包含此 tool_call_id
        for (let k = fixedMessages.length - 1; k >= 0; k--) {
          const prev = fixedMessages[k];
          if (prev.role === 'assistant' && prev.tool_calls && Array.isArray(prev.tool_calls)) {
            if (prev.tool_calls.some((tc: any) => tc.id === m.tool_call_id)) {
              foundParent = true;
              break;
            }
          }
        }
        if (!foundParent) {
          logger.warn(`[Chat API] 跳过孤立 tool 消息 (call_id=${m.tool_call_id})`);
          continue;
        }
      }
      fixedMessages.push(m);
    }
    // 如果修复了消息，使用修复后的版本
    if (fixedMessages.length !== msgs.length) {
      logger.info(`[Chat API] tool_calls 校验: ${msgs.length} → ${fixedMessages.length} 条消息`);
      truncated.messages = fixedMessages;
    }

    // 获取会话级 AbortController
    abortController = messageQueue.getCurrentAbortController(sessionId);
    if (!abortController) {
      throw new Error('未找到会话级 AbortController');
    }

    // 选择执行模式
    let effectiveMode = (params.executionMode && Object.values(ExecutionMode).includes(params.executionMode as ExecutionMode))
      ? (params.executionMode as ExecutionMode)
      : undefined;
    if (!effectiveMode) {
      try {
        const settingsVal = getAppSettings('default');
        if (settingsVal) {
          const parsed = JSON.parse(settingsVal);
          const defaultMode = parsed?.aiEngine?.defaultExecutionMode;
          if (defaultMode && Object.values(ExecutionMode).includes(defaultMode as ExecutionMode)) {
            effectiveMode = defaultMode as ExecutionMode;
          }
        }
      } catch { /* ignore */ }
    }
    if (!effectiveMode) {
      effectiveMode = ExecutionStrategyFactory.getDefaultMode();
    }

    const strategy = ExecutionStrategyFactory.create(effectiveMode);

    // 确保 sessionApprovedSet 已注册
    if (!sessionApprovedToolsCache.has(sessionId)) {
      // v2.5.0: 注入全局白名单（含通配符模式，后续通过 isToolAlwaysAllowed 匹配）
      for (const t of loadAlwaysAllowedTools()) {
        params.sessionApprovedSet.add(t);
      }
      sessionApprovedToolsCache.set(sessionId, params.sessionApprovedSet);
    }

    // v2.2.0: 全局 keep-alive — 每 15 秒发送一次 SSE 注释，防止 WKWebView 因长时间无数据关闭 SSE 连接
    // 使用 SSE 标准注释格式（以 ":" 开头），所有 SSE 客户端都会忽略，但会保持连接活跃
    // v1.5.165: WKWebView 兼容 — 通过 queryParam _nowk=1 禁用（WKWebView 可能对 keep_alive 处理有 bug）
    // executeFromQueue 没有 req 参数，所以不能直接读取 query；如果需要禁用，通过 params 传递
    let keepAliveTimer: NodeJS.Timeout | null = null;
    keepAliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        try {
          // SSE 注释格式：":" 开头的行是注释，客户端必须忽略
          // 部分浏览器/引擎要求注释至少有一个字符，所以加个空格
          res.write(': keep-alive\n\n');
        } catch { /* ignore */ }
      }
    }, 15000); // 15 秒，给 AI 足够时间思考

    let fullContent = '';
    let thinkingContent = '';
    let hasThinking = false;
    let thinkingStartTime: number | null = null;
    const usageData: any = undefined;

    // v8.6: 语义记忆检索 — 统一入口，所有策略（Legacy/Observer/ReAct）共享
    // 在 strategy.execute() 之前注入历史记忆到 messages
    const latestUserMessage = truncated.messages
      .slice().reverse().find((m: any) => m.role === 'user');
    if (latestUserMessage && typeof latestUserMessage.content === 'string') {
      try {
        // 给 searchMemory 添加 5 秒超时，避免 ONNX 模型下载阻塞 chat 请求
        const memoryResults: VecSearchResult[] = await Promise.race([
          searchMemory(
            latestUserMessage.content, 'default', 5, 0.35,
          ),
          new Promise<VecSearchResult[]>(resolve => setTimeout(() => resolve([]), 5000)),
        ]);
        if (memoryResults.length > 0) {
          const totalChars = memoryResults.reduce((sum, r) => sum + r.entry.content.length, 0);
          const totalTokens = Math.ceil(totalChars / 1.5);
          if (totalTokens <= 500) {
            const memoryContext = memoryResults
              .map(r => `[${r.entry.category}] ${r.entry.content} (相似度: ${r.similarity.toFixed(2)})`)
              .join('\n');
            truncated.messages.push({
              role: 'system',
              content: `[历史记忆]\n${memoryContext}`,
            } as typeof truncated.messages[number]);

            if (!res.writableEnded) {
              try {
                res.write(`data: ${JSON.stringify({
                  type: 'memory_retrieved',
                  count: memoryResults.length,
                  summaries: memoryResults.map(r => r.entry.content.substring(0, 50)),
                })}\n\n`);
              } catch { /* ignore */ }
            }

            logger.debug(`[Chat API] 语义记忆注入: ${memoryResults.length} 条, 估算 ${totalTokens} tokens`);
          }
        }
      } catch (memErr) {
        logger.warn('[Chat API] 语义记忆检索失败（已跳过）:', memErr instanceof Error ? memErr.message : String(memErr));
      }
    }

    // 在 strategy.execute 前清理孤儿 tool 消息，避免 API 400 错误
    const sanitizedMessages = sanitizeToolMessages(truncated.messages as any) as Array<{ role: string; content: MessageContent; tool_calls?: any[]; tool_call_id?: string }>;

    const toolResult = await strategy.execute({
      modelConfig: finalModelConfig as any,
      messages: sanitizedMessages,
      maxToolTurns: 10,
      signal: messageQueue.getCurrentAbortController(sessionId)?.signal ?? new AbortController().signal,
      executionMode: effectiveMode,
      onSSEEvent: (evt: Record<string, unknown>) => {
        if (!res.writableEnded) {
          try { res.write(`data: ${JSON.stringify(evt)}\n\n`); } catch { /* ignore */ }
        }
      },
      onChunk: (chunk: string) => {
        fullContent += chunk;
        if (!res.writableEnded) {
          try { res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`); } catch { /* ignore */ }
        }
      },
      onThinking: (thinkingChunk: string) => {
        if (!hasThinking) { hasThinking = true; thinkingStartTime = Date.now(); }
        thinkingContent += thinkingChunk;
        if (!res.writableEnded) {
          try { res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`); } catch { /* ignore */ }
        }
      },
      onPermissionRequest: (toolCall: any) => {
        const reqId = `perm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const toolName = toolCall.function?.name || toolCall.name || 'unknown';
        const args = toolCall.function?.arguments || toolCall.args || '';
        const riskLevel = getToolRiskLevel(toolName);
        const sessionSet = sessionApprovedToolsCache.get(sessionId);
        if (sessionSet?.has(toolName)) return Promise.resolve(true);
        reqIdToolMap.set(reqId, { toolName, sessionId });
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'permission_request',
              reqId,
              toolName,
              args,
              riskLevel,
            })}\n\n`);
          } catch { /* ignore */ }
        }
        return new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 60000);
          const handler = (approved: boolean) => {
            clearTimeout(timeout);
            permissionEmitter.removeListener(reqId, handler);
            if (approved) {
              sessionSet?.add(toolName);
            }
            resolve(approved);
          };
          permissionEmitter.once(reqId, handler);
        });
      },
      onToolCall: (toolCall: any, result: string) => {
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'tool_call',
              tool: toolCall.function?.name || toolCall.name,
              args: toolCall.function?.arguments || toolCall.args,
              result,
              id: toolCall.id,
            })}\n\n`);
          } catch { /* ignore */ }
        }
      },
      approvedToolsCache: params.sessionApprovedSet,
      reasoningEffort: params.reasoningEffort,
    });

    // 保存助手消息
    addMessage({
      sessionId,
      role: 'assistant',
      content: toolResult.content,
      model: params.model,
      toolCalls: toolResult.toolCalls?.length ? JSON.stringify(toolResult.toolCalls) : undefined,
      thinking: thinkingContent || undefined,
      thinkingDuration: hasThinking && thinkingStartTime ? Date.now() - thinkingStartTime : undefined,
    });

    // 异步记忆学习
    extractAndAppendMemory(params.message, toolResult.content, dbMessages.map(m => ({ role: m.role, content: m.content }))).catch(() => {});

    // 清理
    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }

    // 发送 done 事件
    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          errorCode: null,
          errorMessage: null,
          thinkingDuration: (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0,
          usage: usageData || null,
        })}\n\n`);
        await new Promise(r => setTimeout(r, 200));
        res.end();
      } catch { /* ignore */ }
    }

    // 标记队列执行完成
    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);

  } catch (error) {
    logger.error('[MessageQueue executeFromQueue] 执行失败:', error);

    // v1.5.116: 模型降级逻辑 — 与 /chat 路由一致的降级链
    const isModelUnsupported =
      error instanceof AIAPIError && error.category === 'model_not_supported';
    const isRecoverable = isModelUnsupported || (
      error instanceof AIAPIError && (
        error.category === 'timeout' ||
        error.category === 'network' ||
        error.category === 'server'
      )
    );

    if (isRecoverable) {
      const currentModelConfig = params.modelsConfig.models.find(m => m.id === params.model);
      const fbModel = params.modelsConfig.models.find(m =>
        m.enabled && m.id !== params.model && !m.capabilities?.includes('reasoning') && currentModelConfig && m.provider === currentModelConfig.provider && isModelAvailable(m)
      ) || params.modelsConfig.models.find(m =>
        m.enabled && m.id !== params.model && isModelAvailable(m)
      );

      if (fbModel) {
        const reasonLabel = isModelUnsupported ? '模型不支持' : '请求失败';
        logger.debug(`[MessageQueue] ${reasonLabel}，降级到 ${fbModel.id}...`);

        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'text',
              content: `\n\n> ⚠️ ${reasonLabel}，已自动切换到 **${fbModel.name || fbModel.id}** 重试...\n\n`,
            })}\n\n`);
          } catch { /* ignore */ }
        }

        try {
          const fbKey = selectKey(fbModel);
          const fbApiKey = fbKey ? fbKey.key : (fbModel.apiKey || '');
          const fbModelConfig: ModelCallConfig = {
            id: fbModel.id,
            apiKey: fbApiKey,
            apiEndpoint: fbModel.apiEndpoint || '',
            provider: fbModel.provider || '',
            maxTokens: fbModel.maxTokens || 4096,
            temperature: fbModel.temperature ?? 0.7,
            contextWindow: (fbModel as any).contextWindow || 128000,
          };

          const strategy = ExecutionStrategyFactory.create(params.executionMode as ExecutionMode || ExecutionMode.REACT);
          void strategy.execute({
            modelConfig: fbModelConfig,
            messages: apiMessages as any,
            maxToolTurns: 10,
            signal: abortController?.signal ?? new AbortController().signal,
            executionMode: (params.executionMode as ExecutionMode) || ExecutionMode.REACT,
            approvedToolsCache: params.sessionApprovedSet,
          });

          if (fbKey && fbKey.index >= 0) { reportKeyResult(fbModel.id, fbKey.index, true); }

          if (!res.writableEnded) {
            try {
              res.write(`data: ${JSON.stringify({ type: 'done', errorCode: null, errorMessage: null, thinkingDuration: 0, fallbackModel: fbModel.id, fallbackReason: isModelUnsupported ? 'model_not_supported' : 'request_failed' })}\n\n`);
              await new Promise(r => setTimeout(r, 200));
              res.end();
            } catch { /* ignore */ }
          }

          messageQueue.markCompleted(sessionId);
          activeSSEConnections.delete(sessionId);
          return;
        } catch (fbErr) {
          logger.warn(`[MessageQueue] 降级模型 ${fbModel.id} 也失败:`, fbErr);
        }
      }
    }

    if (!res.writableEnded) {
      try {
        const errMsg = error instanceof Error ? error.message : '服务器内部错误';
        res.write(`data: ${JSON.stringify({
          type: 'done',
          errorCode: 'QUEUE_EXEC_ERROR',
          errorMessage: errMsg,
          thinkingDuration: 0,
        })}\n\n`);
        await new Promise(r => setTimeout(r, 200));
        res.end();
      } catch { /* ignore */ }
    }

    // 确保标记完成（即使出错也要解锁队列）
    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);
  }
}

// 发送消息（SSE）
router.post('/chat', async (req, res) => {
  const { sessionId, message, model = 'auto', skillContext, skillId, preset, conversationHistory, attachments, reasoningEffort, executionMode, queueMode } = req.body;
  logger.debug(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, message="${message?.slice(0, 30)}", queueMode=${queueMode || 'default'}`);
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    logger.debug(`[Chat API] 附件数量: ${attachments.length}`);
  }

  // v1.5.116: 在 try 外部声明关键变量，使 catch 块内降级逻辑可访问
  let apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: any[]; tool_call_id?: string }> = [];
  let sessionApprovedSet: Set<string> = new Set();
  let abortController: AbortController = new AbortController();

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    // v2.2.3: 立即发送响应头 + 禁用 TCP Nagle，确保 SSE 小包（thinking/keep-alive）
    // 不会被 200ms 延迟积累后导致 WKWebView ReadableStream 断连
    res.flushHeaders();
    if (req.socket) {
      req.socket.setNoDelay(true);
    }

    // Auto 模式：智能选择最合适的模型
    const modelsConfig = await loadModelsConfig();
    let effectiveModel: string;
    let effectiveModelName: string;
    let autoReason: string | undefined;
    let autoReasonType: string | undefined;
    if (model === 'auto') {
      const hasImageAttachment = attachments && Array.isArray(attachments) && attachments.some((att: { type: string }) => att.type === 'image');
      const autoResult = autoSelectModel(message, modelsConfig, hasImageAttachment);
      effectiveModel = autoResult.modelId;
      effectiveModelName = autoResult.modelName;
      autoReason = `${autoResult.modelName} · ${autoResult.reason}`;
      autoReasonType = autoResult.reasonType;
      logger.debug(`[Auto Model] ${autoResult.reasonType} → ${autoResult.modelName} (${autoResult.modelId})`);
    } else {
      effectiveModel = model;
      const found = modelsConfig.models.find(m => m.id === model);
      effectiveModelName = found?.name || model;
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
    addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null, attachments: attachments || undefined });

    // 发送初始化事件（Auto 模式附加选择原因 + 预设信息）
    const assistantId = uuidv4();
    res.write(`data: ${JSON.stringify({
      type: 'init',
      sessionId,
      assistantMessageId: assistantId,
      model: effectiveModel,
      modelName: effectiveModelName,
      autoReason,
      autoReasonType,
      preset: activePreset ? { id: preset, label: activePreset.label } : null,
      reasoningEffort: reasoningEffort || null,
    })}\n\n`);

    // v7.0: 队列模式处理
    // 当前端指定 queueMode 时，消息通过 MessageQueue 管理执行
    // 无 queueMode 时保持原有直接执行行为（向后兼容）
    const effectiveQueueMode = queueMode as QueueMode | undefined;
    if (effectiveQueueMode) {
      // 注册 SSE 连接到活跃连接池
      activeSSEConnections.set(sessionId, { res, assistantMessageId: assistantId });

      const result = messageQueue.enqueue(sessionId, message, effectiveQueueMode, {
        model: effectiveModel,
        modelName: effectiveModelName,
        skillContext,
        skillId,
        preset,
        attachments,
        reasoningEffort,
        executionMode,
        conversationHistory,
        autoReason,
        autoReasonType,
      });

      if (!result.accepted) {
        // 队列已满，拒绝消息
        res.write(`data: ${JSON.stringify({
          type: 'queue_rejected',
          reason: result.reason,
        })}\n\n`);
        await new Promise(r => setTimeout(r, 200));
        res.end();
        activeSSEConnections.delete(sessionId);
        return;
      }

      // 发送队列状态事件
      res.write(`data: ${JSON.stringify({
        type: 'queue_status',
        mode: effectiveQueueMode,
        state: messageQueue.getSessionState(sessionId),
        queueLength: messageQueue.getQueueLength(sessionId),
        assistantMessageId: result.assistantMessageId,
      })}\n\n`);

      // 如果是 collect/steer 模式且消息需要等待，保持 SSE 连接
      // 队列的 executing 事件会触发实际执行（通过下方监听器）
      // 当消息出队执行时，需要重新走完整的 chat 执行流程
      // 这里我们监听 executing 事件来启动执行
      const executeHandler = (event: QueueEvent) => {
        if (event.sessionId !== sessionId) return;
        if (event.type === 'executing' && event.messageId === result.messageId) {
          // 从队列中移除此监听器
          messageQueue.off('queue', executeHandler);
          // 触发实际执行（复用下方的主执行逻辑）
          executeFromQueue(sessionId, event, res, {
            model: effectiveModel,
            modelName: effectiveModelName,
            assistantId: result.assistantMessageId,
            preset: activePreset,
            reasoningEffort,
            executionMode,
            conversationHistory,
            skillContext,
            skillId,
            attachments,
            autoReason,
            autoReasonType,
            message,
            modelsConfig,
            sessionApprovedSet: sessionApprovedToolsCache.get(sessionId) ?? new Set<string>(),
          });
        }
      };

      messageQueue.on('queue', executeHandler);

      // 如果队列状态已经是 executing（直出场景），立即执行
      // 这种情况发生在 idle 状态下入队，scheduleExecution 同步调度成功时
      const currentState = messageQueue.getSessionState(sessionId);
      if (currentState === 'executing' && messageQueue.getCurrentAssistantId(sessionId) === result.assistantMessageId) {
        messageQueue.off('queue', executeHandler);
        executeFromQueue(sessionId, {
          type: 'executing',
          sessionId,
          messageId: result.messageId,
          assistantMessageId: result.assistantMessageId,
          mode: effectiveQueueMode,
          queueLength: 0,
          state: 'executing',
        }, res, {
          model: effectiveModel,
          modelName: effectiveModelName,
          assistantId: result.assistantMessageId,
          preset: activePreset,
          reasoningEffort,
          executionMode,
          conversationHistory,
          skillContext,
          skillId,
          attachments,
          autoReason,
          autoReasonType,
          message,
          modelsConfig,
          sessionApprovedSet: sessionApprovedToolsCache.get(sessionId) ?? new Set<string>(),
        });
      }

      // 返回 — 实际执行在 executeFromQueue 中异步进行
      return;
    }

      // 调用 AI 模型 API 进行流式对话
      let fullContent = '';
      let selectedKeyIndex = -1;
      // Thinking 跟踪
      let thinkingStartTime: number | null = null;
      let hasThinking = false;
      let thinkingContent = '';
      // v3.0: thinking chunk 计数器，用于控制触发器匹配频率
      let thinkingChunkCount = 0;
      // v2.2.0: 全局 keep-alive — 每 10 秒发送一次，防止 WKWebView 因长时间无数据关闭 SSE 连接
      let keepAliveTimer: NodeJS.Timeout | null = null;
      // v2.2.0: usage 数据收集
      let usageData: { promptTokens?: number; completionTokens?: number; thinkingTokens?: number; totalTokens?: number } | undefined;
      // v2.2.0: toolCalls JSON（缓存命中时为 undefined）
      let toolCallsJson: string | undefined;
      // v1.9.3: 提前获取模型配置，用于 catch 块中的错误提示
      const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);
    try {

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
      apiMessages = [];

      // v1.9.3: 注入图片处理指引系统提示
      const hasImageInRequest = attachments && Array.isArray(attachments) && attachments.some((att: { type: string }) => att.type === 'image');
      if (hasImageInRequest) {
        apiMessages.push({
          role: 'system',
          content: `你是一个具备视觉理解能力的AI助手，当前用户上传了图片。请遵循以下规则处理图片：

1. **意图识别**：首先识别图片内容（单据、截图、商品、库存、报表等），理解用户上传图片的意图。
2. **数据提取**：如果图片包含结构化信息（如订单号、商品名称、数量、金额等），请提取关键数据。
3. **主动执行**：根据图片内容和提取的数据，主动调用相关工具执行操作（如查询库存、创建订单、更新数据等）。
4. **业务关联**：将图片内容与仓储管理系统（WMS）业务关联，提供有价值的分析和建议。
5. **清晰回复**：先简要说明你从图片中识别到的内容，然后说明你执行了什么操作或建议什么操作。

注意：不要只是简单描述图片内容，要理解用户意图并采取实际行动。`,
        });
      }

      // v8.5: 注入人格层 system message（最前面，优先级最高）
      const soulSystemMsg = buildSoulSystemMessage();
      if (soulSystemMsg.trim()) {
        apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
      }

      // 注入 MEMORY.md 上下文（补充记忆）
      const memoryContent = await readMemoryMd();
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

      // v1.9.3: 判断模型是否真正支持多模态（图片）
      // 注意：DeepSeek API 目前不支持 image_url 格式，已从列表中移除
      const isMultimodalModel = modelConfig.capabilities?.includes('multimodal');
      const isKnownVisionModel = [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
        'qwen-vl', 'qwen-vl-max',
        'kimi-k2.6', 'kimi-k2.5',
      ].some(id => modelConfig.id.toLowerCase().includes(id.toLowerCase()));
      // ⚠️ DeepSeek API 不支持 image_url 格式，即使有 multimodal 标签也视为不支持
      const isFalsePositiveVision = /deepseek/i.test(modelConfig.id);
      const supportsVision = (isMultimodalModel || isKnownVisionModel) && !isFalsePositiveVision;

      // 添加历史对话（如果前端传了 conversationHistory）
      // v1.9.0: 包含 toolCalls，确保多轮工具调用上下文不丢失
      // v1.9.3: 包含 attachments，确保多轮图片上下文不丢失
      // v1.9.3-fix: 历史消息中的图片只在当前模型支持 Vision 时才发送
      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
            // v1.9.3: 如果历史用户消息包含图片附件，仅在模型支持 Vision 时构建 Vision 格式
            if (msg.role === 'user' && msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0 && supportsVision) {
              const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
              if (msg.content) {
                contentParts.push({ type: 'text', text: msg.content });
              }
              for (const att of msg.attachments) {
                if (att.type === 'image') {
                  try {
                    const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
                    const fileBuffer = await fsp.readFile(filePath);
                    const base64 = fileBuffer.toString('base64');
                    contentParts.push({
                      type: 'image_url',
                      image_url: { url: `data:${att.mimeType};base64,${base64}`, detail: 'auto' },
                    });
                  } catch (err: any) {
                    if (err.code !== 'ENOENT') {
                      logger.error(`[Chat API] 读取历史图片附件失败: ${att.fileName}`, err);
                    }
                  }
                }
              }
              if (contentParts.length > 0) {
                apiMessages.push({ role: msg.role, content: contentParts });
              } else {
                apiMessages.push({ role: msg.role, content: msg.content });
              }
            } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
              // v1.9.3-fix: assistant 消息含 toolCalls 时，必须携带 tool_calls 字段
              // OpenAI 要求 tool 角色消息前必须有带 tool_calls 的 assistant 消息
              // 为每个 toolCall 生成稳定的 callId，确保 assistant.tool_calls[].id === tool.tool_call_id
              const callIds = msg.toolCalls.map(() => `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
              apiMessages.push({
                role: 'assistant',
                content: msg.content || null,
                tool_calls: msg.toolCalls.map((tc: any, i: number) => ({
                  id: callIds[i],
                  type: 'function',
                  function: {
                    name: tc.name,
                    arguments: tc.arguments,
                  },
                })),
              } as any);
              // 直接在这里插入 tool 角色消息，避免下方重复生成不一致的 ID
              for (let i = 0; i < msg.toolCalls.length; i++) {
                apiMessages.push({
                  role: 'tool',
                  content: msg.toolCalls[i].result ?? "(tool result unavailable)",
                  tool_call_id: callIds[i],
                } as any);
              }
            } else {
              apiMessages.push({ role: msg.role, content: msg.content });
            }
          }
          // [已移除] 孤儿 tool 消息代码 — assistant 的 toolCalls 已在上方连同 tool_calls 字段一起处理
          // sanitizeToolMessages 安全网会在 contextTruncate 中清理残留的孤儿 tool 消息
          // if (msg.role !== 'assistant' && msg.toolCalls && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) { ... }
        }
      }

      // 添加当前用户消息（含附件处理）
      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        // 构建 OpenAI Vision 格式的 content 数组
        const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];

        // 添加文本内容（如果用户未输入文字，给出默认提示帮助 AI 理解意图并触发工具调用）
        const effectiveMessage = message?.trim() || '请仔细识别并分析这张图片的内容，理解用户的意图，然后根据图片内容和你的能力采取相应的行动（如调用工具查询数据、生成报表、执行操作等）。如果图片包含单据、订单、库存、商品等信息，请提取关键数据并执行相关业务操作。';
        contentParts.push({ type: 'text', text: effectiveMessage });

        // 如果上传了图片但模型不支持，添加提示文本
        const hasImageAttachments = attachments.some((att: { type: string }) => att.type === 'image');
        if (hasImageAttachments && !supportsVision) {
          contentParts.push({
            type: 'text',
            text: `\n⚠️ [系统提示] 当前模型 "${modelConfig.name}" (${modelConfig.id}) 不支持图片理解。已上传图片但模型无法识别内容。如需分析图片，请切换到支持多模态的模型，如：\n- GPT-4o (OpenAI)\n- Claude 3 Sonnet/Opus (Anthropic)\n- Gemini 1.5 Pro (Google)\n- Qwen-VL (阿里云)\n`,
          });
        }

        // 处理附件
        for (const att of attachments) {
          if (att.type === 'image') {
            // 图片：仅在模型支持多模态时转为 base64 data URL
            if (supportsVision) {
              try {
                const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
                const fileBuffer = await fsp.readFile(filePath);
                const base64 = fileBuffer.toString('base64');
                contentParts.push({
                  type: 'image_url',
                  image_url: {
                    url: `data:${att.mimeType};base64,${base64}`,
                    detail: 'auto',
                  },
                });
              } catch (err: any) {
                if (err.code !== 'ENOENT') {
                  logger.error(`[Chat API] 读取图片附件失败: ${att.fileName}`, err);
                }
              }
            }
            // 不支持多模态的模型：跳过图片，已在上方添加提示文本
          } else {
            // 文件：读取内容并作为文本注入
            try {
              const filePath = path.join(CDF_KNOW_CLOW_DIR, 'uploads', path.basename(att.url));
              const ext = path.extname(att.fileName).toLowerCase().replace('.', '');
              const fileContent = await extractFileContent(filePath, ext, att.fileName);
              contentParts.push({
                type: 'text',
                text: fileContent,
              });
            } catch (err: any) {
              if (err.code !== 'ENOENT') {
                logger.error(`[Chat API] 读取文件附件失败: ${att.fileName}`, err);
                contentParts.push({
                  type: 'text',
                  text: `\n---\n[附件: ${att.fileName} - 读取失败]\n---\n`,
                });
              }
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
      abortController = new AbortController();
      // 超时时间：reasoning 模型需要更长时间（thinking 可能很久）
      // 本地模型也给更长超时
      let timeoutMs: number;
      if (isLocalModel(modelConfig)) {
        timeoutMs = 300000; // 本地模型 5 分钟
      } else if (reasoningEffort === 'max') {
        timeoutMs = 600000; // max 推理 10 分钟
      } else if (reasoningEffort === 'high') {
        timeoutMs = 300000; // high 推理 5 分钟
      } else {
        timeoutMs = 120000; // 普通模型 2 分钟
      }
      let timeout = setTimeout(() => abortController.abort(), timeoutMs);

      // v2.2.0: 启动全局 keep-alive — 每 10 秒发送一次，防止 WKWebView 因长时间无数据关闭 SSE 连接
      // 这在 thinking 阶段尤其重要（AI 思考时可能数十秒无输出）
      // v1.5.165: WKWebView 兼容 — 通过 queryParam _nowk=1 禁用（WKWebView 可能对 keep_alive 处理有 bug）
  // const noKeepAlive = req.query._nowk === "1";
  // if (!noKeepAlive) {
  // keepAliveTimer = setInterval(() => {
  // res.write(`data: ${JSON.stringify({ type: 'keep_alive', timestamp: Date.now(), thinking: hasThinking, elapsed: thinkingStartTime ? Date.now() - thinkingStartTime : 0 })}
  // \n\n`);
  // }, 10000);
  // }

      try {
        // 无 API Key 且非本地模型时使用模拟模式
        if (!effectiveApiKey && !isLocalModel(modelConfig)) {
          logger.debug(`[Chat API] 模型 ${effectiveModel} 未配置 API Key，使用模拟模式`);
          const mockResponse = generateMockResponse(message);
          const segments = mockResponse.match(/[\s\S]{1,5}/g) || [mockResponse];
          for (const segment of segments) {
            res.write(`data: ${JSON.stringify({ type: 'text', content: segment })}\n\n`);
            await new Promise(r => setTimeout(r, 15));
          }
          fullContent = mockResponse;
        } else {
          // v1.9.0: 使用 Tool Calling 循环
          // v1.9.2: 敏感工具权限请求 — 发送事件到前端并等待响应
          // v1.9.6: 传入 Session 级工具授权缓存，同一会话内授权一次后不再重复授权
          sessionApprovedSet = sessionApprovedToolsCache.get(sessionId) ?? new Set<string>();
          if (!sessionApprovedToolsCache.has(sessionId)) {
            // v2.3.3: 首次创建会话时，注入全局始终允许的工具（含通配符模式）
            for (const t of loadAlwaysAllowedTools()) {
              sessionApprovedSet.add(t);
            }
            sessionApprovedToolsCache.set(sessionId, sessionApprovedSet);
          }

          // v2.2.0: Thinking 缓存检查
          let cacheHit = false;
          if (reasoningEffort) {
            const cacheKey = getThinkingCacheKey(effectiveModel, message, reasoningEffort);
            const cached = getThinkingCache(cacheKey);
            if (cached) {
              logger.debug('[Chat API] Thinking cache hit for', effectiveModel);
              cacheHit = true;
              fullContent = cached.content;
              thinkingContent = cached.thinking;
              hasThinking = !!thinkingContent;
              if (hasThinking) thinkingStartTime = 0;
              // 发送缓存结果到前端
              if (thinkingContent) {
                res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingContent })}\n\n`);
              }
              res.write(`data: ${JSON.stringify({ type: 'text', content: fullContent })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'cache_hit', cached: true })}\n\n`);
            }
          }

          if (!cacheHit) {
          // v1.5.73: 截断/压缩上下文以适配模型 token 限制
          const ctxWindow = (finalModelConfig as any).contextWindow || 128000;
          // v1.5.131: 截断用 maxTokens 上限 8192，避免 384K 浪费输入空间
          const ctxMaxTokens = Math.min((finalModelConfig as any).maxTokens || 8192, 8192);
          const estimatedToolsCount = 30;
          // v1.5.116: 优先尝试智能压缩
          let compressed = false;
          try {
            const compressResult = await compressContextWithSummary(
              apiMessages, ctxWindow, ctxMaxTokens, estimatedToolsCount, finalModelConfig,
            );
            apiMessages = compressResult.messages as any;
            compressed = compressResult.compressed;
            if (compressed) {
              logger.debug('[Chat API] 上下文已智能压缩（流式）');
            }
          } catch {
            // 压缩失败，降级为简单截断
          }
          const truncated = truncateContextForModel(apiMessages, ctxWindow, ctxMaxTokens, estimatedToolsCount);
          if (truncated.truncated || compressed) {
            res.write(`data: ${JSON.stringify({
              type: 'context_truncated',
              originalTokens: estimateMessagesTokens(apiMessages),
              truncatedTokens: estimateMessagesTokens(truncated.messages),
              modelLimit: ctxWindow,
              compressed,
            })}\n\n`);
          }

          // v4.0: 策略模式 — 根据 executionMode 选择执行策略
          let effectiveMode = (executionMode && Object.values(ExecutionMode).includes(executionMode as ExecutionMode))
            ? (executionMode as ExecutionMode)
            : undefined;

          // 如果请求未指定 executionMode，从 app_settings 读取全局默认值
          if (!effectiveMode) {
            try {
              const settingsVal = getAppSettings('default');
              if (settingsVal) {
                const parsed = JSON.parse(settingsVal);
                const defaultMode = parsed?.aiEngine?.defaultExecutionMode;
                if (defaultMode && Object.values(ExecutionMode).includes(defaultMode as ExecutionMode)) {
                  effectiveMode = defaultMode as ExecutionMode;
                }
              }
            } catch { /* ignore settings read error, fallback to default */ }
          }

          if (!effectiveMode) {
            effectiveMode = ExecutionStrategyFactory.getDefaultMode();
          }

          const strategy = ExecutionStrategyFactory.create(effectiveMode);

          // v8.6: 语义记忆检索 — 统一入口，所有策略共享
          const latestUserMsg = truncated.messages
            .slice().reverse().find((m: any) => m.role === 'user');
          if (latestUserMsg && typeof latestUserMsg.content === 'string') {
            try {
              // 给 searchMemory 添加 5 秒超时，避免 ONNX 模型下载阻塞 chat 请求
              const memResults: VecSearchResult[] = await Promise.race([
                searchMemory(
                  latestUserMsg.content, 'default', 5, 0.35,
                ),
                new Promise<VecSearchResult[]>(resolve => setTimeout(() => resolve([]), 5000)),
              ]);
              if (memResults.length > 0) {
                const memChars = memResults.reduce((sum, r) => sum + r.entry.content.length, 0);
                const memTokens = Math.ceil(memChars / 1.5);
                if (memTokens <= 500) {
                  const memCtx = memResults
                    .map(r => `[${r.entry.category}] ${r.entry.content} (相似度: ${r.similarity.toFixed(2)})`)
                    .join('\n');
                  truncated.messages.push({
                    role: 'system',
                    content: `[历史记忆]\n${memCtx}`,
                  } as typeof truncated.messages[number]);

                  res.write(`data: ${JSON.stringify({
                    type: 'memory_retrieved',
                    count: memResults.length,
                    summaries: memResults.map(r => r.entry.content.substring(0, 50)),
                  })}\n\n`);

                  logger.debug(`[Chat API] 语义记忆注入（流式）: ${memResults.length} 条, 估算 ${memTokens} tokens`);
                }
              }
            } catch (memErr) {
              logger.warn('[Chat API] 语义记忆检索失败（流式，已跳过）:', memErr instanceof Error ? memErr.message : String(memErr));
            }
          }

          // 在 strategy.execute 前清理孤儿 tool 消息，避免 API 400 错误
          const sanitizedStreamMessages = sanitizeToolMessages(truncated.messages as any) as Array<{ role: string; content: MessageContent; tool_calls?: any[]; tool_call_id?: string }>;

          const toolResult = await strategy.execute({
            modelConfig: finalModelConfig,
            messages: sanitizedStreamMessages,
            maxToolTurns: 10,
            signal: abortController.signal,
            executionMode: effectiveMode,
            onSSEEvent: (event) => {
              res.write(`data: ${JSON.stringify(event)}\n\n`);
            },
            onChunk: (chunk) => {
              res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
            },
            onThinking: (thinkingChunk) => {
              if (!hasThinking) {
                hasThinking = true;
                thinkingStartTime = Date.now();
              }
              thinkingContent += thinkingChunk;
              thinkingChunkCount++;
              res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}
\n\n`);

              // v3.0: 检查插件触发器匹配（每 5 个 chunk 检查一次，避免高频匹配）
              if (thinkingChunkCount % 5 === 0 && thinkingContent.length > 20) {
                matchTriggers(thinkingContent, sessionId).then((matches) => {
                  for (const match of matches) {
                    // 发送 client_tool 事件到前端
                    res.write(`data: ${JSON.stringify({
                      type: 'client_tool',
                      tool: match.toolName,
                      args: match.args,
                      pluginId: match.pluginId,
                    })}\n\n`);

                    // 同时在服务端执行插件工具，发送 plugin_result 事件
                    executePluginTrigger(match).then((result) => {
                      res.write(`data: ${JSON.stringify({
                        type: 'plugin_result',
                        tool: match.toolName,
                        output: result.output,
                        durationMs: result.durationMs,
                        pluginId: match.pluginId,
                      })}\n\n`);
                    }).catch((err) => {
                      logger.error('[Chat API] plugin trigger execution failed:', err);
                    });
                  }
                }).catch((err) => {
                  logger.error('[Chat API] trigger matching failed:', err);
                });
              }
            },
            onToolCall: (toolCall, result) => {
              // 发送 tool_call 事件到前端（用于展示工具调用过程）
              res.write(`data: ${JSON.stringify({
                type: 'tool_call',
                toolCallId: toolCall.id,
                toolName: toolCall.function.name,
                toolArgs: toolCall.function.arguments,
                toolResult: result,
              })}\n\n`);
              // v2.2.1: 发送工具执行审计事件
              const isDenied = result.includes('用户拒绝了工具');
              const isError = !isDenied && result.includes('"error"');
              const auditResult = isDenied ? 'denied' : isError ? 'error' : 'success';
              res.write(`data: ${JSON.stringify({
                type: 'tool_audit',
                toolName: toolCall.function.name,
                result: auditResult,
                timestamp: Date.now(),
              })}\n\n`);
            },
            // v1.9.3: 敏感工具权限请求 — 通过 EventEmitter 等待前端响应
            // 无超时限制，用户可以在任何时候响应
            onPermissionRequest: (toolCall) => {
              // v1.5.66: 系统授权启用时自动通过所有权限请求，无需前端弹窗
              if (isSystemAuthorized()) {
                logger.debug('[Chat API] 系统授权已启用，自动通过工具权限:', toolCall.function.name);
                return Promise.resolve(true);
              }
              return new Promise((resolve) => {
                const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                // v2.3.3: 存储 reqId → { toolName, sessionId } 映射
                reqIdToolMap.set(reqId, { toolName: toolCall.function.name, sessionId });
                // 发送权限请求事件到前端
                res.write(`data: ${JSON.stringify({
                  type: 'permission_request',
                  reqId,
                  toolName: toolCall.function.name,
                  toolArgs: toolCall.function.arguments,
                  riskLevel: getToolRiskLevel(toolCall.function.name),
                })}\n\n`);
                // v1.9.3: 权限等待期间清除超时，无时间限制
                clearTimeout(timeout);
                timeout = null as any;
                // 监听前端响应
                const handler = (approved: boolean) => {
                  permissionEmitter.removeListener(reqId, handler);
                  // 用户响应后恢复原始超时
                  timeout = setTimeout(() => abortController.abort(), timeoutMs);
                  // v2.2.1: 发送权限决策审计事件
                  res.write(`data: ${JSON.stringify({
                    type: 'tool_audit',
                    toolName: toolCall.function.name,
                    result: approved ? 'approved' : 'denied',
                    timestamp: Date.now(),
                  })}\n\n`);
                  resolve(approved);
                };
                permissionEmitter.once(reqId, handler);
              });
            },
            reasoningEffort,
            // v2.2.0: 透传模型能力标签
            modelCapabilities: modelConfig.capabilities || [],
            approvedToolsCache: sessionApprovedSet,
            // v1.5.116: 速率限制时自动切换备用 Key
            onRateLimit: async () => {
              if (selectedKeyIndex >= 0 && effectiveModel) {
                reportKeyResult(effectiveModel, selectedKeyIndex, false);
              }
              const nextKey = selectKey(modelConfig);
              if (nextKey) {
                selectedKeyIndex = nextKey.index;
                logger.debug(`[Chat API] 429 速率限制，切换到备用 Key #${nextKey.index}`);
                return { apiKey: nextKey.key, keyIndex: nextKey.index };
              }
              return null;
            },
          });
          fullContent = toolResult.content;
          // v2.2.0: 收集 usage 数据（从最后一轮 AI 调用中获取）
          // 注意：toolLoop 内多轮调用时，这里获取的是最后一轮的 usage
          // v2.2.0: 写入 thinking 缓存
          if (reasoningEffort && thinkingContent) {
            const cacheKey = getThinkingCacheKey(effectiveModel, message, reasoningEffort);
            setThinkingCache(cacheKey, fullContent, thinkingContent);
          }
          // v1.9.5-fix: 如果 toolLoop 返回空内容但有思考过程，用思考内容作为兜底
          // 避免 fullContent 为空导致前端显示"内容生成失败"
          if (!fullContent && thinkingContent) {
            const trimmedThinking = thinkingContent.trim();
            if (trimmedThinking) {
              // v2.2.0: 取最后完整段落而非固定 500 字，确保语义完整
              const paragraphs = trimmedThinking.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/);
              const lastParagraph = paragraphs.filter(p => p.trim().length > 20).pop() || trimmedThinking;
              const summary = lastParagraph.length > 800
                ? '（思考摘要）\n\n' + lastParagraph.slice(-800)
                : '（思考摘要）\n\n' + lastParagraph;
              fullContent = summary;
            }
          }
          // v1.5.57: 双空保护 — 模型既无文本输出也无思考过程
          if (!fullContent && !thinkingContent?.trim()) {
            logger.warn('[Chat API] 模型返回空内容，无文本也无思考，sessionId=%s model=%s', sessionId, effectiveModel);
            fullContent = '（模型未返回内容，可能是请求超时或服务异常，请重试）';
          }
          toolCallsJson = toolResult.toolCalls.length > 0 ? JSON.stringify(toolResult.toolCalls) : undefined;
          } // end if (!cacheHit)
        }
      } finally {
        clearTimeout(timeout);
        // v2.2.0: 清除 keep-alive 定时器
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      }

      // 保存完整的助手回复（含 toolCalls、thinking）
      const thinkingDuration = (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0;
      addMessage({
        sessionId, role: 'assistant', content: fullContent, model: effectiveModel,
        skillId: skillId || null, toolCalls: toolCallsJson,
        thinking: thinkingContent || null,
        thinkingDuration: thinkingDuration || null,
      });
      // 报告 Key 使用成功
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, true);
      }

      // 异步自动记忆学习（不阻塞主流程，不 await）
      extractAndAppendMemory(message, fullContent, apiMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))).catch(() => {});
    } catch (apiError) {
      logger.error('[Chat API] AI API error:', apiError);
      logger.error('[Chat API] Stack trace:', apiError instanceof Error ? apiError.stack : 'N/A');

      // v1.5.116: 降级重试逻辑（executeFromQueue 简化版）
      // 降级链：按优先级寻找备用模型（同 provider 非推理 → 任意非推理 → 任意可用）
      const isModelUnsupported =
        apiError instanceof AIAPIError && apiError.category === 'model_not_supported';
      const isRecoverable = isModelUnsupported || (
        apiError instanceof AIAPIError && (
          apiError.category === 'timeout' ||
          apiError.category === 'network' ||
          apiError.category === 'server'
        )
      );

      if (isRecoverable && modelConfig) {
        // 构建降级链（简化版，不含 SSE 推送）
        const fbModel = modelsConfig.models.find(m =>
          m.enabled && m.id !== effectiveModel && !m.capabilities?.includes('reasoning') && m.provider === modelConfig.provider && isModelAvailable(m)
        ) || modelsConfig.models.find(m =>
          m.enabled && m.id !== effectiveModel && isModelAvailable(m)
        );

        if (fbModel) {
          const reasonLabel = isModelUnsupported ? '模型不支持' : '请求失败';
          logger.debug(`[Chat API] ${reasonLabel}，降级到 ${fbModel.id}...`);
          res.write(`data: ${JSON.stringify({
            type: 'text',
            content: `\n\n> ⚠️ ${reasonLabel}，已自动切换到 **${fbModel.name || fbModel.id}** 重试...\n\n`,
          })}\n\n`);

          try {
            const fbKey = selectKey(fbModel);
            const fbApiKey = fbKey ? fbKey.key : (fbModel.apiKey || '');
            const fbModelConfig: ModelCallConfig = {
              id: fbModel.id,
              apiKey: fbApiKey,
              apiEndpoint: fbModel.apiEndpoint || '',
              provider: fbModel.provider,
              temperature: fbModel.temperature ?? 0.7,
              topP: fbModel.topP ?? 1,
              maxTokens: fbModel.maxTokens,
              capabilities: (fbModel.capabilities || []).filter((c: string) => c !== 'reasoning'),
            };
            const fbResult = await executeToolLoop({
              modelConfig: fbModelConfig,
              messages: apiMessages,
              maxToolTurns: 10,
              signal: abortController?.signal ?? new AbortController().signal,
              onChunk: (chunk) => {
                res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
              },
              // v1.5.168: fallback 路径也要正确传递 thinking 事件（某些 fallback 模型仍可能返回 reasoning_content）
              onThinking: (thinkingChunk: string) => {
                if (!hasThinking) { hasThinking = true; thinkingStartTime = Date.now(); }
                thinkingContent += thinkingChunk;
                if (!res.writableEnded) {
                  try { res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`); } catch { /* ignore */ }
                }
              },
              onPermissionRequest: () => Promise.resolve(isSystemAuthorized()),
              reasoningEffort: undefined,
              modelCapabilities: fbModelConfig.capabilities || [],
              approvedToolsCache: sessionApprovedSet,
            });

            fullContent = fbResult.content;
            toolCallsJson = fbResult.toolCalls.length > 0 ? JSON.stringify(fbResult.toolCalls) : undefined;
            addMessage({ sessionId, role: 'assistant', content: fullContent, model: fbModel.id, skillId: skillId || null, toolCalls: toolCallsJson });
            if (fbKey && fbKey.index >= 0) { reportKeyResult(fbModel.id, fbKey.index, true); }

            res.write(`data: ${JSON.stringify({ type: 'done', errorCode: null, errorMessage: null, thinkingDuration: 0, fallbackModel: fbModel.id, fallbackReason: isModelUnsupported ? 'model_not_supported' : 'request_failed' })}\n\n`);
            await new Promise(r => setTimeout(r, 200));
            res.end();
            return;
          } catch (fbErr) {
            logger.warn(`[Chat API] 降级模型 ${fbModel.id} 也失败:`, fbErr);
          }
        }
      }
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
          case 'network': {
            // v1.9.3: 本地模型连接失败时提供更精准的提示
            const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
            if (isLocal) {
              const modelName = modelConfig?.id?.replace('ollama-', '') || '';
              errorMsg = `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`;
              errorCode = 'MODEL_UNAVAILABLE';
            } else {
              errorMsg = '网络连接失败，请检查网络或 API 端点配置。';
              errorCode = 'NETWORK_ERROR';
            }
            break;
          }
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
        if (errMessage.includes('stdout closed') || errMessage.includes('ENOENT') || errMessage.includes('ECONNREFUSED') || errMessage.includes('connect') || errMessage.includes('fetch failed')) {
          // 判断是否为本地模型，提供更精准的提示
          const isLocal = modelConfig ? isLocalModel(modelConfig) : false;
          if (isLocal) {
            const modelName = modelConfig?.id?.replace('ollama-', '') || '';
            errorMsg = `无法连接到本地 AI 模型服务（${effectiveModel}）。\n\n请检查以下事项：\n1. 确认 Ollama 或其他本地模型服务已启动\n2. 运行 'ollama serve' 启动服务（如使用 Ollama）\n3. 确认模型已下载：ollama pull ${modelName}\n4. 检查端口是否正确（默认 11434）\n\n或者切换到云模型（如 DeepSeek、OpenAI）使用。`;
          } else {
            errorMsg = `无法连接到 AI 模型服务（${effectiveModel}）。请确认模型服务已启动。\n提示：如果使用 Ollama，请先运行 'ollama serve' 启动服务。`;
          }
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
        // v1.5.58: 延迟关闭连接，确保 WKWebView 有足够时间解析最后一个 SSE 事件
        await new Promise(r => setTimeout(r, 200));
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
        // v2.2.0: 传递 token 使用统计
        usage: usageData || null,
      })}\n\n`);
      // v1.5.58: 延迟关闭连接，确保 WKWebView 有足够时间解析最后一个 SSE 事件
      await new Promise(r => setTimeout(r, 200));
      res.end();
    } catch {
      // 响应流可能已关闭，忽略
    }
  } catch (error) {
    logger.error('Chat API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    } else {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '服务器内部错误' })}\n\n`);
      res.end();
    }
  }
});

// v1.9.2: 工具权限响应 — 前端通过此端点回复权限请求
router.post('/permission-response', (req, res) => {
  const { reqId, approved, alwaysAllow, toolCategory } = req.body;
  if (!reqId) {
    return res.status(400).json({ error: 'reqId is required' });
  }
  // v2.5.0: 如果用户勾选"始终允许"，持久化工具名/类别到 app_settings
  if (alwaysAllow) {
    const info = reqIdToolMap.get(reqId);
    if (info) {
      const { toolName, sessionId } = info;
      try {
        loadAlwaysAllowedTools();
        // 优先存储类别通配符（如 mcp__tencent_docs__*），否则存储精确工具名
        const patternToStore = toolCategory || toolName;
        globalAlwaysAllowed!.add(patternToStore);
        // 如果存储了通配符，也把当前工具名加入（即时生效）
        if (toolCategory && toolCategory !== toolName) {
          globalAlwaysAllowed!.add(toolName);
        }
        setAppSettings('always_allowed_tools', JSON.stringify([...globalAlwaysAllowed!]));
        // 同时注入当前会话缓存
        const sessionCache = sessionApprovedToolsCache.get(sessionId);
        if (sessionCache) {
          sessionCache.add(patternToStore);
          if (toolCategory && toolCategory !== toolName) {
            sessionCache.add(toolName);
          }
        }
      } catch (e) {
        logger.warn('[permission-response] 持久化 alwaysAllow 失败:', e);
      }
    }
    reqIdToolMap.delete(reqId);
  }
  // 通过 EventEmitter 通知对应的 chat 请求
  permissionEmitter.emit(reqId, approved === true);
  res.json({ ok: true });
});

// v7.0: 获取队列状态
router.get('/queue-status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  res.json({
    sessionId,
    state: messageQueue.getSessionState(sessionId),
    queueLength: messageQueue.getQueueLength(sessionId),
    activeGlobalCount: messageQueue.getActiveCount(),
    canAcceptGlobal: messageQueue.canAcceptGlobal(),
  });
});

// v7.0: 取消队列中所有消息
router.post('/queue-cancel/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const cancelledCount = messageQueue.cancelAll(sessionId);
  activeSSEConnections.delete(sessionId);
  res.json({ ok: true, cancelledCount });
});

export default router;
