import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { promises as fsp } from 'fs';
import os from 'os';
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
import { matchTriggers, executePluginTrigger } from '../services/pluginAutoInvoke.js';
import { messageQueue, type QueueMode, type QueueEvent } from '../engine/messageQueue.js';
import { searchMemory, type VecSearchResult } from '../engine/vecMemoryStore.js';
import { logger } from '../logger.js';
import { autoSelectModel, generateMockResponse, isModelAvailable, MODEL_PRESETS } from './modelSelector.js';
import { extractAndAppendMemory, readMemoryMd } from './memoryExtractor.js';
import {
  permissionEmitter,
  isSystemAuthorized,
  initSessionApprovedTools,
  registerPermissionRequest,
} from './toolPermissionService.js';
import { getAppSettings } from '../dao/settings.js';

// 动态 require（用于可选依赖 pdf-parse/mammoth/xlsx）
declare function require(id: string): any;

const CDF_KNOW_CLOW_DIR = path.join(os.homedir(), '.cdf-know-clow');

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

// v2.2.0: Thinking 结果缓存（LRU，最多 50 条，TTL 10 分钟）
const thinkingCache = new Map<string, { content: string; thinking: string; timestamp: number }>();
const THINKING_CACHE_MAX = 50;
const THINKING_CACHE_TTL = 10 * 60 * 1000; // 10 分钟

function getThinkingCacheKey(model: string, message: string, effort: string): string {
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
    const oldest = [...thinkingCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    if (oldest) thinkingCache.delete(oldest[0]);
  }
  thinkingCache.set(key, { content, thinking, timestamp: Date.now() });
}

// ===================== File Content Extraction =====================

async function extractFileContent(filePath: string, ext: string, fileName: string): Promise<string> {
  const MAX_SIZE = 100000;

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

  if (ext === 'pptx') {
    return `\n---\n[附件: ${fileName} (PPT 演示文稿)]\n注: PPT 文件暂不支持内容提取，请转换为 PDF 后上传\n---\n`;
  }

  const stats = await fsp.stat(filePath);
  return `\n---\n[附件: ${fileName} (${(stats.size / 1024).toFixed(1)}KB)]\n注: 此文件类型暂不支持内容预览\n---\n`;
}

// ===================== Queue Execution =====================

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

async function executeFromQueue(
  sessionId: string,
  event: QueueEvent,
  res: import('express').Response,
  params: QueueExecuteParams,
): Promise<void> {
  logger.debug(`[MessageQueue] 执行出队消息: sessionId=${sessionId}, mode=${event.mode}, messageId=${event.messageId}`);

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

    const dbMessages = getSessionMessages(sessionId);
    apiMessages = [];

    const soulSystemMsg = buildSoulSystemMessage();
    if (soulSystemMsg.trim()) {
      apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
    }

    const memoryContent = await readMemoryMd();
    if (memoryContent.trim()) {
      apiMessages.push({ role: 'system', content: memoryContent.trim() });
    }

    if (params.skillContext?.trim()) {
      apiMessages.push({ role: 'system', content: params.skillContext.trim() });
    }

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

    const ctxWindow = (finalModelConfig as any).contextWindow || 128000;
    const ctxMaxTokens = Math.min((finalModelConfig as any).maxTokens || 8192, 8192);
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

    const msgs = truncated.messages as any[];
    const fixedMessages: any[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        const neededIds = new Set<string>();
        for (const tc of m.tool_calls) {
          if (tc.id) neededIds.add(tc.id);
        }
        for (let j = i + 1; j < msgs.length; j++) {
          if (msgs[j].role === 'tool' && msgs[j].tool_call_id && neededIds.has(msgs[j].tool_call_id)) {
            neededIds.delete(msgs[j].tool_call_id);
            if (neededIds.size === 0) break;
          } else if (msgs[j].role !== 'tool') {
            break;
          }
        }
        if (neededIds.size > 0) {
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
      if (m.role === 'tool' && m.tool_call_id) {
        let foundParent = false;
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
    if (fixedMessages.length !== msgs.length) {
      logger.info(`[Chat API] tool_calls 校验: ${msgs.length} → ${fixedMessages.length} 条消息`);
      truncated.messages = fixedMessages;
    }

    abortController = messageQueue.getCurrentAbortController(sessionId);
    if (!abortController) {
      throw new Error('未找到会话级 AbortController');
    }

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

    initSessionApprovedTools(sessionId);

    let keepAliveTimer: NodeJS.Timeout | null = null;
    keepAliveTimer = setInterval(() => {
      if (!res.writableEnded) {
        try {
          res.write(': keep-alive\n\n');
        } catch { /* ignore */ }
      }
    }, 15000);

    let fullContent = '';
    let thinkingContent = '';
    let hasThinking = false;
    let thinkingStartTime: number | null = null;
    const usageData: any = undefined;

    const latestUserMessage = truncated.messages
      .slice().reverse().find((m: any) => m.role === 'user');
    if (latestUserMessage && typeof latestUserMessage.content === 'string') {
      try {
        const memoryResults: VecSearchResult[] = await Promise.race([
          searchMemory(
            latestUserMessage.content, 'default', 5, 0.35, sessionId,
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
        const sessionSet = initSessionApprovedTools(sessionId);
        if (sessionSet?.has(toolName)) return Promise.resolve(true);
        registerPermissionRequest(reqId, toolName, sessionId);
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

    addMessage({
      sessionId,
      role: 'assistant',
      content: toolResult.content,
      model: params.model,
      toolCalls: toolResult.toolCalls?.length ? JSON.stringify(toolResult.toolCalls) : undefined,
      thinking: thinkingContent || undefined,
      thinkingDuration: hasThinking && thinkingStartTime ? Date.now() - thinkingStartTime : undefined,
    });

    extractAndAppendMemory(params.message, toolResult.content, dbMessages.map(m => ({ role: m.role, content: m.content }))).catch(() => {});

    if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }

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

    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);

  } catch (error) {
    logger.error('[MessageQueue executeFromQueue] 执行失败:', error);

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

    messageQueue.markCompleted(sessionId);
    activeSSEConnections.delete(sessionId);
  }
}

// ===================== Main Chat Handler =====================

export async function handleChat(req: import('express').Request, res: import('express').Response): Promise<void> {
  const { sessionId, message, model = 'auto', skillContext, skillId, preset, conversationHistory, attachments, reasoningEffort, executionMode, queueMode } = req.body;
  logger.debug(`[Chat API] 收到请求: sessionId=${sessionId}, model=${model}, message="${message?.slice(0, 30)}", queueMode=${queueMode || 'default'}`);
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    logger.debug(`[Chat API] 附件数量: ${attachments.length}`);
  }

  let apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: any[]; tool_call_id?: string }> = [];
  let sessionApprovedSet: Set<string> = new Set();
  let abortController: AbortController = new AbortController();

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();
    if (req.socket) {
      req.socket.setNoDelay(true);
    }

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

    const activePreset = preset && MODEL_PRESETS[preset] ? MODEL_PRESETS[preset] : null;

    const sessions = getSessions();
    const sessionExists = sessions.some(s => s.id === sessionId);
    if (!sessionExists) {
      createSession(sessionId, '新对话', effectiveModel, undefined);
    }

    addMessage({ sessionId, role: 'user', content: message, model: effectiveModel, skillId: skillId || null, attachments: attachments || undefined });

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

    const effectiveQueueMode = queueMode as QueueMode | undefined;
    if (effectiveQueueMode) {
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
        res.write(`data: ${JSON.stringify({
          type: 'queue_rejected',
          reason: result.reason,
        })}\n\n`);
        await new Promise(r => setTimeout(r, 200));
        res.end();
        activeSSEConnections.delete(sessionId);
        return;
      }

      res.write(`data: ${JSON.stringify({
        type: 'queue_status',
        mode: effectiveQueueMode,
        state: messageQueue.getSessionState(sessionId),
        queueLength: messageQueue.getQueueLength(sessionId),
        assistantMessageId: result.assistantMessageId,
      })}\n\n`);

      const executeHandler = (event: QueueEvent) => {
        if (event.sessionId !== sessionId) return;
        if (event.type === 'executing' && event.messageId === result.messageId) {
          messageQueue.off('queue', executeHandler);
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
            sessionApprovedSet: initSessionApprovedTools(sessionId),
          });
        }
      };

      messageQueue.on('queue', executeHandler);

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
          sessionApprovedSet: initSessionApprovedTools(sessionId),
        });
      }

      return;
    }

    let fullContent = '';
    let selectedKeyIndex = -1;
    let thinkingStartTime: number | null = null;
    let hasThinking = false;
    let thinkingContent = '';
    let thinkingChunkCount = 0;
    let keepAliveTimer: NodeJS.Timeout | null = null;
    let usageData: { promptTokens?: number; completionTokens?: number; thinkingTokens?: number; totalTokens?: number } | undefined;
    let toolCallsJson: string | undefined;
    const modelConfig = modelsConfig.models.find((m) => m.id === effectiveModel);

    try {
      if (!modelConfig) {
        throw new Error(`未找到模型配置: ${effectiveModel}`);
      }

      const keyResult = selectKey(modelConfig);
      let effectiveApiKey = modelConfig.apiKey || '';
      if (keyResult) {
        effectiveApiKey = keyResult.key;
        selectedKeyIndex = keyResult.index;
      }

      apiMessages = [];

      const hasImageInRequest = attachments && Array.isArray(attachments) && attachments.some((att: { type: string }) => att.type === 'image');
      if (hasImageInRequest) {
        apiMessages.push({
          role: 'system',
          content: `你是一个具备视觉理解能力的AI助手，当前用户上传了图片。请遵循以下规则处理图片：\n\n1. **意图识别**：首先识别图片内容（单据、截图、商品、库存、报表等），理解用户上传图片的意图。\n2. **数据提取**：如果图片包含结构化信息（如订单号、商品名称、数量、金额等），请提取关键数据。\n3. **主动执行**：根据图片内容和提取的数据，主动调用相关工具执行操作（如查询库存、创建订单、更新数据等）。\n4. **业务关联**：将图片内容与仓储管理系统（WMS）业务关联，提供有价值的分析和建议。\n5. **清晰回复**：先简要说明你从图片中识别到的内容，然后说明你执行了什么操作或建议什么操作。\n\n注意：不要只是简单描述图片内容，要理解用户意图并采取实际行动。`,
        });
      }

      const soulSystemMsg = buildSoulSystemMessage();
      if (soulSystemMsg.trim()) {
        apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
      }

      const memoryContent = await readMemoryMd();
      if (memoryContent.trim()) {
        apiMessages.push({ role: 'system', content: memoryContent.trim() });
      }

      if (skillContext && typeof skillContext === 'string' && skillContext.trim()) {
        apiMessages.push({ role: 'system', content: skillContext.trim() });
      }

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

      const isMultimodalModel = modelConfig.capabilities?.includes('multimodal');
      const isKnownVisionModel = [
        'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
        'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
        'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
        'qwen-vl', 'qwen-vl-max',
        'kimi-k2.6', 'kimi-k2.5',
      ].some(id => modelConfig.id.toLowerCase().includes(id.toLowerCase()));
      const isFalsePositiveVision = /deepseek/i.test(modelConfig.id);
      const supportsVision = (isMultimodalModel || isKnownVisionModel) && !isFalsePositiveVision;

      if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
        for (const msg of conversationHistory) {
          if (msg.role === 'user' || msg.role === 'assistant') {
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
            } else if (msg.role === 'assistant' && msg.toolCalls) {
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
                      function: {
                        name: tc.name,
                        arguments: tc.arguments,
                      },
                    })),
                  } as any);
                  for (let i = 0; i < toolCalls.length; i++) {
                    apiMessages.push({
                      role: 'tool',
                      content: toolCalls[i].result ?? "(tool result unavailable)",
                      tool_call_id: callIds[i],
                    } as any);
                  }
                } else {
                  apiMessages.push({ role: msg.role, content: msg.content });
                }
              } catch (parseErr) {
                logger.warn('[Chat API] 流式路径 toolCalls 解析失败，降级为普通消息:', parseErr);
                apiMessages.push({ role: msg.role, content: msg.content });
              }
            } else {
              apiMessages.push({ role: msg.role, content: msg.content });
            }
          }
        }
      }

      if (attachments && Array.isArray(attachments) && attachments.length > 0) {
        const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
        const effectiveMessage = message?.trim() || '请仔细识别并分析这张图片的内容，理解用户的意图，然后根据图片内容和你的能力采取相应的行动（如调用工具查询数据、生成报表、执行操作等）。如果图片包含单据、订单、库存、商品等信息，请提取关键数据并执行相关业务操作。';
        contentParts.push({ type: 'text', text: effectiveMessage });

        const hasImageAttachments = attachments.some((att: { type: string }) => att.type === 'image');
        if (hasImageAttachments && !supportsVision) {
          contentParts.push({
            type: 'text',
            text: `\n⚠️ [系统提示] 当前模型 "${modelConfig.name}" (${modelConfig.id}) 不支持图片理解。已上传图片但模型无法识别内容。如需分析图片，请切换到支持多模态的模型，如：\n- GPT-4o (OpenAI)\n- Claude 3 Sonnet/Opus (Anthropic)\n- Gemini 1.5 Pro (Google)\n- Qwen-VL (阿里云)\n`,
          });
        }

        for (const att of attachments) {
          if (att.type === 'image') {
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
          } else {
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

      const finalModelConfig = {
        ...modelConfig,
        apiKey: effectiveApiKey,
        temperature: activePreset ? activePreset.temperature : modelConfig.temperature,
        topP: activePreset ? activePreset.topP : modelConfig.topP,
      };

      abortController = new AbortController();
      let timeoutMs: number;
      if (isLocalModel(modelConfig)) {
        timeoutMs = 300000;
      } else if (reasoningEffort === 'max') {
        timeoutMs = 600000;
      } else if (reasoningEffort === 'high') {
        timeoutMs = 300000;
      } else {
        timeoutMs = 120000;
      }
      let timeout = setTimeout(() => abortController.abort(), timeoutMs);

      try {
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
          sessionApprovedSet = initSessionApprovedTools(sessionId);

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
              if (thinkingContent) {
                res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingContent })}\n\n`);
              }
              res.write(`data: ${JSON.stringify({ type: 'text', content: fullContent })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'cache_hit', cached: true })}\n\n`);
            }
          }

          if (!cacheHit) {
            const ctxWindow = (finalModelConfig as any).contextWindow || 128000;
            const ctxMaxTokens = Math.min((finalModelConfig as any).maxTokens || 8192, 8192);
            const estimatedToolsCount = 30;
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

            let effectiveMode = (executionMode && Object.values(ExecutionMode).includes(executionMode as ExecutionMode))
              ? (executionMode as ExecutionMode)
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

            const latestUserMsg = truncated.messages
              .slice().reverse().find((m: any) => m.role === 'user');
            if (latestUserMsg && typeof latestUserMsg.content === 'string') {
              try {
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
                res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingChunk })}\n\n`);

                if (thinkingChunkCount % 5 === 0 && thinkingContent.length > 20) {
                  matchTriggers(thinkingContent, sessionId).then((matches) => {
                    for (const match of matches) {
                      res.write(`data: ${JSON.stringify({
                        type: 'client_tool',
                        tool: match.toolName,
                        args: match.args,
                        pluginId: match.pluginId,
                      })}\n\n`);

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
                res.write(`data: ${JSON.stringify({
                  type: 'tool_call',
                  toolCallId: toolCall.id,
                  toolName: toolCall.function.name,
                  toolArgs: toolCall.function.arguments,
                  toolResult: result,
                })}\n\n`);
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
              onPermissionRequest: (toolCall) => {
                if (isSystemAuthorized()) {
                  logger.debug('[Chat API] 系统授权已启用，自动通过工具权限:', toolCall.function.name);
                  return Promise.resolve(true);
                }
                return new Promise((resolve) => {
                  const reqId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
                  registerPermissionRequest(reqId, toolCall.function.name, sessionId);
                  res.write(`data: ${JSON.stringify({
                    type: 'permission_request',
                    reqId,
                    toolName: toolCall.function.name,
                    toolArgs: toolCall.function.arguments,
                    riskLevel: getToolRiskLevel(toolCall.function.name),
                  })}\n\n`);
                  clearTimeout(timeout);
                  timeout = null as any;
                  const handler = (approved: boolean) => {
                    permissionEmitter.removeListener(reqId, handler);
                    timeout = setTimeout(() => abortController.abort(), timeoutMs);
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
              modelCapabilities: modelConfig.capabilities || [],
              approvedToolsCache: sessionApprovedSet,
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
            if (reasoningEffort && thinkingContent) {
              const cacheKey = getThinkingCacheKey(effectiveModel, message, reasoningEffort);
              setThinkingCache(cacheKey, fullContent, thinkingContent);
            }
            if (!fullContent && thinkingContent) {
              const trimmedThinking = thinkingContent.trim();
              if (trimmedThinking) {
                const paragraphs = trimmedThinking.split(/\n{2,}|\n(?=[A-Z\u4e00-\u9fff])/);
                const lastParagraph = paragraphs.filter(p => p.trim().length > 20).pop() || trimmedThinking;
                const summary = lastParagraph.length > 800
                  ? '（思考摘要）\n\n' + lastParagraph.slice(-800)
                  : '（思考摘要）\n\n' + lastParagraph;
                fullContent = summary;
              }
            }
            if (!fullContent && !thinkingContent?.trim()) {
              logger.warn('[Chat API] 模型返回空内容，无文本也无思考，sessionId=%s model=%s', sessionId, effectiveModel);
              fullContent = '（模型未返回内容，可能是请求超时或服务异常，请重试）';
            }
            toolCallsJson = toolResult.toolCalls.length > 0 ? JSON.stringify(toolResult.toolCalls) : undefined;
          }
        }
      } finally {
        clearTimeout(timeout);
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
      }

      const thinkingDuration = (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0;
      addMessage({
        sessionId, role: 'assistant', content: fullContent, model: effectiveModel,
        skillId: skillId || null, toolCalls: toolCallsJson,
        thinking: thinkingContent || null,
        thinkingDuration: thinkingDuration || null,
      });
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, true);
      }

      extractAndAppendMemory(message, fullContent, apiMessages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }))).catch(() => {});
    } catch (apiError) {
      logger.error('[Chat API] AI API error:', apiError);
      logger.error('[Chat API] Stack trace:', apiError instanceof Error ? apiError.stack : 'N/A');

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

      fullContent = '';

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
        if (errMessage.includes('stdout closed') || errMessage.includes('ENOENT') || errMessage.includes('ECONNREFUSED') || errMessage.includes('connect') || errMessage.includes('fetch failed')) {
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
      if (selectedKeyIndex >= 0 && effectiveModel) {
        reportKeyResult(effectiveModel, selectedKeyIndex, false);
      }

      try {
        res.write(`data: ${JSON.stringify({
          type: 'done',
          errorCode,
          errorMessage: errorMsg,
          thinkingDuration: 0,
        })}\n\n`);
        await new Promise(r => setTimeout(r, 200));
        res.end();
      } catch {
        // 响应流可能已关闭，忽略
      }
      return;
    }

    try {
      const thinkingDuration = (hasThinking && thinkingStartTime) ? Date.now() - thinkingStartTime : 0;
      res.write(`data: ${JSON.stringify({
        type: 'done',
        errorCode: null,
        errorMessage: null,
        thinkingDuration,
        usage: usageData || null,
      })}\n\n`);
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
}

export { activeSSEConnections };
