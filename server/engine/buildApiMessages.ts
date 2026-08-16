/**
 * buildApiMessages — 构建 API 消息数组
 *
 * 从 chatService.ts 提取，消除 handleChat 与 executeQueuedMessage 的重复代码。
 * 统一处理：图片系统消息、Soul 系统消息、Memory.md、技能上下文、
 * 引用会话上下文、历史消息重建、用户消息附件、
 * 历史消息消毒、上下文压缩、tool_calls 配对校验。
 */

import path from 'path';
import { promises as fsp } from 'fs';
import type { ModelCallConfig } from '../aiClient.js';
import { AppPaths } from '../config/appPaths.js';
import { buildSoulSystemMessage } from './soulLoader.js';
import { truncateContextForModel, type ApiMessage } from './contextTruncate.js';
import { sanitizeHistoryMessages } from './historySanitizer.js';
import { resolveImageSanitizationLimits } from './imageSanitization.js';
import { compressContextWithSummary } from './contextCompress.js';
import type { ModelConfig } from '../modelsStore.js';
import { readMemoryMd } from '../routes/memoryExtractor.js';
import { memoryEngine } from '../memoryEngine.js';
import { getSessionMessages, getSessions } from '../dao/chat.js';
import { extractFileContent } from '../routes/chatHelpers/fileExtractor.js';
import { getAppSettings } from '../dao/settings.js';
import { logger } from '../logger.js';

import type { Message } from '../db-chat.js';

// ===================== 系统提示词版本戳 =====================

/**
 * 系统提示词构建版本戳（G4 审计）。
 * 每次变更本文件的系统消息装配逻辑（Soul / Memory / 技能上下文 / 引用会话等）时递增。
 * 回合事件（turn.started）payload 携带本版本，用于追溯"该回合模型看到了哪版提示词"。
 */
export const SYSTEM_PROMPT_VERSION = 'chat.v1';

// ===================== 文件夹上下文扫描 =====================

// 支持文本读取的扩展名白名单（与 fileExtractor 保持一致）
const FOLDER_TEXT_EXTS = new Set([
  'txt', 'csv', 'json', 'md', 'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'go', 'rs',
  'cpp', 'c', 'h', 'hpp', 'rb', 'php', 'swift', 'kt', 'scala', 'r', 'm', 'mm',
  'yaml', 'yml', 'xml', 'toml', 'ini', 'cfg', 'conf', 'sql', 'sh', 'bat', 'ps1',
  'css', 'scss', 'less', 'vue', 'svelte', 'dart', 'lua', 'pl', 'pm', 'log', 'tsv',
  'html', 'htm',
]);

const FOLDER_MAX_FILE_SIZE = 100_000; // 单文件 100KB
const FOLDER_MAX_TOTAL_SIZE = 800_000; // 总内容 800KB
const FOLDER_MAX_FILES = 200; // 最多读取 200 个文件
const FOLDER_MAX_DEPTH = 5; // 递归最大深度

/**
 * 扫描指定文件夹下的文本文件并读取内容，组装为 AI 上下文字符串
 */
async function scanFolderContent(folderPath: string): Promise<string | null> {
  try {
    const stats = await fsp.stat(folderPath);
    if (!stats.isDirectory()) {
      return null;
    }

    const parts: string[] = [];
    let totalSize = 0;
    let readCount = 0;
    let skippedCount = 0;
    const folderName = path.basename(folderPath);

    async function walkDir(dir: string, depth: number): Promise<void> {
      if (depth > FOLDER_MAX_DEPTH) return;
      if (readCount >= FOLDER_MAX_FILES || totalSize >= FOLDER_MAX_TOTAL_SIZE) return;

      let entries: import('fs').Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch (err) {
        logger.warn(`[FolderContext] 无法读取目录 ${dir}:`, err);
        return;
      }

      // 按名称排序保证可重复性
      entries.sort((a, b) => a.name.localeCompare(b.name));

      for (const entry of entries) {
        if (readCount >= FOLDER_MAX_FILES || totalSize >= FOLDER_MAX_TOTAL_SIZE) return;

        // 跳过常见忽略目录
        if (entry.isDirectory()) {
          if (['node_modules', '.git', 'dist', 'build', '.next', '__pycache__', '.cache', '.idea', '.vscode'].includes(entry.name)) {
            continue;
          }
          await walkDir(path.join(dir, entry.name), depth + 1);
          continue;
        }

        if (!entry.isFile()) continue;
        const ext = entry.name.slice(entry.name.lastIndexOf('.') + 1).toLowerCase();
        if (!FOLDER_TEXT_EXTS.has(ext)) continue;

        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(folderPath, fullPath);

        try {
          const fileStat = await fsp.stat(fullPath);
          if (fileStat.size > FOLDER_MAX_FILE_SIZE) {
            parts.push(`\n--- ${relPath} (文件过大: ${(fileStat.size / 1024).toFixed(1)}KB，已跳过) ---`);
            skippedCount++;
            continue;
          }

          const content = await fsp.readFile(fullPath, 'utf-8');
          parts.push(`\n--- ${relPath} ---\n\`\`\`${ext}\n${content}\n\`\`\``);
          totalSize += content.length;
          readCount++;
        } catch (err) {
          parts.push(`\n--- ${relPath} (读取失败) ---`);
          skippedCount++;
        }
      }
    }

    await walkDir(folderPath, 0);

    if (readCount === 0) {
      return `<folder_context path="${folderPath}">\n未发现可读取的文本文件\n</folder_context>`;
    }

    const summary = `【文件夹】${folderName}（路径: ${folderPath}）— 读取 ${readCount} 个文本文件${skippedCount > 0 ? `，跳过 ${skippedCount} 个` : ''}`;
    const tailNote = (readCount >= FOLDER_MAX_FILES || totalSize >= FOLDER_MAX_TOTAL_SIZE)
      ? `\n\n（已达到读取上限，部分文件未读取）`
      : '';

    return `<folder_context path="${folderPath}">\n${summary}\n${parts.join('\n')}${tailNote}\n</folder_context>`;
  } catch (err) {
    logger.warn(`[FolderContext] 扫描文件夹失败 ${folderPath}:`, err);
    return null;
  }
}

/**
 * 解析 folderContext 字符串：
 * - 若以 FOLDER_CONTENT_INLINE 开头：直接返回后续内容（Web 场景前端已读取）
 * - 否则当作文件夹绝对路径，扫描读取
 */
async function resolveFolderContext(folderContext: string): Promise<string | null> {
  if (!folderContext || typeof folderContext !== 'string') return null;

  // Web 场景：前端已读取并标记前缀
  if (folderContext.startsWith('FOLDER_CONTENT_INLINE\n')) {
    const content = folderContext.slice('FOLDER_CONTENT_INLINE\n'.length);
    return `<folder_context>\n${content}\n</folder_context>`;
  }

  // 原生场景：当作绝对路径处理
  // 简单校验：必须存在且为目录
  try {
    const stats = await fsp.stat(folderContext);
    if (stats.isDirectory()) {
      return await scanFolderContent(folderContext);
    }
    logger.warn(`[FolderContext] 路径不是目录: ${folderContext}`);
    return null;
  } catch (err) {
    logger.warn(`[FolderContext] 路径无法访问: ${folderContext}`, err);
    return null;
  }
}

// 以下两个函数从 chatService.ts 提取，保持原样

interface ParsedAttachment {
  type?: string;
  url?: string;
  fileName?: string;
  mimeType?: string;
  name?: string;
  [key: string]: any;
}

function parseMessageAttachments(attachments: any): ParsedAttachment[] {
  if (!attachments) return [];
  if (Array.isArray(attachments)) return attachments as ParsedAttachment[];
  if (typeof attachments === 'string') {
    try {
      const parsed = JSON.parse(attachments);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function hasImageAttachment(attachments: any[] | undefined): boolean {
  return !!(attachments && Array.isArray(attachments) && attachments.some((att) => (att as { type: string }).type === 'image'));
}

const KNOWN_VISION_MODEL_IDS = [
  'gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4-vision',
  'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-3-5-sonnet',
  'gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro-vision',
  'qwen-vl', 'qwen-vl-max',
  'kimi-k2.6', 'kimi-k2.5',
];

function detectVisionModel(modelConfig: { id: string; capabilities?: string[] }): boolean {
  const isMultimodalModel = modelConfig.capabilities?.includes('multimodal');
  const isKnownVisionModel = KNOWN_VISION_MODEL_IDS.some((id) =>
    modelConfig.id.toLowerCase().includes(id.toLowerCase()),
  );
  const isFalsePositiveVision = /deepseek/i.test(modelConfig.id);
  return (isMultimodalModel || isKnownVisionModel) && !isFalsePositiveVision;
}

function rebuildToolCallsFromMessage(
  msg: { role: string; content: string; toolCalls?: string | Array<{ name: string; arguments: string; result?: string }> },
  apiMessages: ApiMessage[],
  reasoningContent?: string,
): boolean {
  if (msg.role !== 'assistant' || !msg.toolCalls) return false;

  try {
    const toolCalls = typeof msg.toolCalls === 'string' ? JSON.parse(msg.toolCalls) : msg.toolCalls;
    if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;

    const callIds = toolCalls.map(() => `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
    const assistantMsg: ApiMessage = {
      role: 'assistant',
      content: msg.content,
      tool_calls: toolCalls.map((tc: { name: string; arguments: string }, i: number) => ({
        id: callIds[i],
        type: 'function',
        function: { name: tc.name, arguments: tc.arguments },
      })),
    };
    if (reasoningContent) {
      assistantMsg.reasoning_content = reasoningContent;
    }
    apiMessages.push(assistantMsg);
    for (let i = 0; i < toolCalls.length; i++) {
      apiMessages.push({
        role: 'tool',
        content: (toolCalls[i] as { result?: string }).result ?? '(tool result unavailable)',
        tool_call_id: callIds[i],
      });
    }
    return true;
  } catch {
    return false;
  }
}

function validateToolCallsPairing<T extends Array<{ role: string; content: any; tool_calls?: Array<{ id?: string }>; tool_call_id?: string }>>(
  messages: T,
): T {
  const fixedMessages: T[number][] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];

    if (m.role === 'assistant' && m.tool_calls && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const neededIds = new Set<string>();
      for (const tc of m.tool_calls) {
        if (tc.id) neededIds.add(tc.id);
      }
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'tool' && messages[j].tool_call_id && neededIds.has(messages[j].tool_call_id!)) {
          neededIds.delete(messages[j].tool_call_id!);
          if (neededIds.size === 0) break;
        } else if (messages[j].role !== 'tool') {
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
        const prev = fixedMessages[k] as { role: string; tool_calls?: Array<{ id?: string }> };
        if (prev.role === 'assistant' && prev.tool_calls && Array.isArray(prev.tool_calls)) {
          if (prev.tool_calls.some((tc) => tc.id === m.tool_call_id)) {
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

  if (fixedMessages.length !== messages.length) {
    logger.info(`[Chat API] tool_calls 校验: ${messages.length} → ${fixedMessages.length} 条消息`);
  }
  return fixedMessages as T;
}

// ===================== 主函数 =====================

export interface BuildApiMessagesParams {
  sessionId: string;
  message: string;
  modelConfig: ModelConfig;
  finalModelConfig: ModelCallConfig;
  dbMessages: ReturnType<typeof getSessionMessages>;
  conversationHistory?: any[];
  skillContext?: string;
  attachments?: any[];
  referencedSessionIds?: string[];
  hasImage: boolean;
  /** 选中的文件夹上下文：原生场景为绝对路径（后端扫描读取）；Web 回退场景为 FOLDER_CONTENT_INLINE 前缀的内容字符串 */
  folderContext?: string;
}

export interface BuildApiMessagesResult {
  apiMessages: ApiMessage[];
}

export async function buildApiMessages(params: BuildApiMessagesParams): Promise<BuildApiMessagesResult> {
  const { sessionId, message, modelConfig, finalModelConfig, dbMessages, hasImage } = params;
  const apiMessages: ApiMessage[] = [];

  // 1. 图片系统消息
  if (hasImage) {
    apiMessages.push({
      role: 'system',
      content: `你是一个具备视觉理解能力的AI助手，当前用户上传了图片。请遵循以下规则处理图片：\n\n1. **意图识别**：首先识别图片内容（单据、截图、商品、库存、报表等），理解用户上传图片的意图。\n2. **数据提取**：如果图片包含结构化信息（如订单号、商品名称、数量、金额等），请提取关键数据。\n3. **主动执行**：根据图片内容和提取的数据，主动调用相关工具执行操作（如查询库存、创建订单、更新数据等）。\n4. **业务关联**：将图片内容与仓储管理系统（WMS）业务关联，提供有价值的分析和建议。\n5. **清晰回复**：先简要说明你从图片中识别到的内容，然后说明你执行了什么操作或建议什么操作。\n\n注意：不要只是简单描述图片内容，要理解用户意图并采取实际行动。`,
    });
  }

  // 2. Soul 系统消息
  const soulSystemMsg = buildSoulSystemMessage();
  if (soulSystemMsg.trim()) {
    apiMessages.push({ role: 'system', content: soulSystemMsg.trim() });
  }

  // 3. Memory.md 内容（基础记忆，全文注入）
  const memoryContent = await readMemoryMd();
  if (memoryContent.trim()) {
    apiMessages.push({ role: 'system', content: memoryContent.trim() });
  }

  // 3b. 向量记忆引擎：基于当前用户消息检索相关记忆片段（与 MEMORY.md 并存，失败时静默降级）
  // 限制返回条数（3 global + 3 session）和总字符数（2000），避免 token 溢出
  try {
    const vecMemoryPrompt = await memoryEngine.getContextPrompt(sessionId, message, {
      globalLimit: 3,
      sessionLimit: 3,
    });
    if (vecMemoryPrompt.trim()) {
      // 字符级预算控制：超过 2000 字符截断
      const trimmed = vecMemoryPrompt.trim().slice(0, 2000);
      apiMessages.push({
        role: 'system',
        content: `<vector_memory>\n以下是通过向量检索从记忆引擎获取的相关记忆片段（按重要性/相关性排序）：\n${trimmed}\n</vector_memory>`,
      });
    }
  } catch (err) {
    logger.warn('[Chat API] 向量记忆检索失败，降级到 MEMORY.md:', err instanceof Error ? err.message : String(err));
  }

  // 4. 技能上下文
  if (params.skillContext && typeof params.skillContext === 'string' && params.skillContext.trim()) {
    apiMessages.push({ role: 'system', content: params.skillContext.trim() });
  }

  // 5. 文件夹上下文（用户选择的文件夹）
  // 原生场景下传入绝对路径，后端扫描读取文件夹内所有文本文件内容
  // Web 回退场景下传入已读取的内容字符串（带 FOLDER_CONTENT_INLINE 前缀）
  if (params.folderContext && typeof params.folderContext === 'string' && params.folderContext.trim()) {
    const folderSystemContent = await resolveFolderContext(params.folderContext);
    if (folderSystemContent) {
      apiMessages.push({
        role: 'system',
        content: `用户已选择一个文件夹作为本次对话的上下文。文件夹内的文本文件内容已为你读取并附在下方 <folder_context> 标签中。\n\n请将文件夹内的内容视为本次对话的核心参考资料：\n1. 优先基于文件夹内文件的实际内容回答用户问题\n2. 引用具体文件时，请使用相对路径标注（如 \`path/to/file.ts\`）\n3. 如果用户的请求涉及分析、总结、修改或扩展这些文件，请直接基于实际内容执行，而非假设\n4. 如文件夹内未覆盖用户问题的相关信息，请明确指出并给出建议\n\n${folderSystemContent}`,
      });
    }
  }

  // 6. 引用会话
  if (Array.isArray(params.referencedSessionIds) && params.referencedSessionIds.length > 0) {
    let sessionContext = '';
    for (const refId of params.referencedSessionIds) {
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

  const supportsVision = detectVisionModel(modelConfig);
  const supportsReasoning = modelConfig.capabilities?.includes('reasoning');
  const historySource: Message[] = (dbMessages && dbMessages.length > 0)
    ? dbMessages
    : (Array.isArray(params.conversationHistory) ? params.conversationHistory as Message[] : []);

  for (const msg of historySource) {
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;

    const msgAttachments = parseMessageAttachments(msg.attachments);
    if (msg.role === 'user' && msgAttachments.length > 0 && supportsVision) {
      const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
      if (msg.content) {
        contentParts.push({ type: 'text', text: msg.content });
      }
      for (const att of msgAttachments) {
        if (att.type === 'image') {
          try {
            const filePath = path.join(AppPaths.uploadsDir, path.basename(att.url || ''));
            const fileBuffer = await fsp.readFile(filePath);
            const base64 = fileBuffer.toString('base64');
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${att.mimeType};base64,${base64}`, detail: 'auto' },
            });
          } catch (err: any) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
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
    } else if (rebuildToolCallsFromMessage(msg, apiMessages, supportsReasoning ? msg.thinking || undefined : undefined)) {
      continue;
    } else {
      const thinkingContent = supportsReasoning ? msg.thinking || undefined : undefined;
      if (thinkingContent) {
        apiMessages.push({ role: msg.role, content: msg.content, reasoning_content: thinkingContent });
      } else {
        apiMessages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // 7. 当前用户消息附件处理
  const attachments = params.attachments;
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    const contentParts: Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: 'auto' | 'low' | 'high' } }> = [];
    const effectiveMessage = message?.trim() || '请仔细识别并分析这张图片的内容，理解用户的意图，然后根据图片内容和你的能力采取相应的行动（如调用工具查询数据、生成报表、执行操作等）。如果图片包含单据、订单、库存、商品等信息，请提取关键数据并执行相关业务操作。';
    contentParts.push({ type: 'text', text: effectiveMessage });

    if (hasImage && !supportsVision) {
      contentParts.push({
        type: 'text',
        text: `\n⚠️ [系统提示] 当前模型 "${modelConfig.name}" (${modelConfig.id}) 不支持图片理解。已上传图片但模型无法识别内容。如需分析图片，请切换到支持多模态的模型，如：\n- GPT-4o (OpenAI)\n- Claude 3 Sonnet/Opus (Anthropic)\n- Gemini 1.5 Pro (Google)\n- Qwen-VL (阿里云)\n`,
      });
    }

    for (const att of attachments) {
      const attRecord = att as { type?: string; url?: string; fileName?: string; mimeType?: string };
      if (attRecord.type === 'image') {
        if (supportsVision) {
          try {
            const filePath = path.join(AppPaths.uploadsDir, path.basename(attRecord.url || ''));
            const fileBuffer = await fsp.readFile(filePath);
            const base64 = fileBuffer.toString('base64');
            contentParts.push({
              type: 'image_url',
              image_url: { url: `data:${attRecord.mimeType};base64,${base64}`, detail: 'auto' },
            });
          } catch (err: any) {
            if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
              logger.error(`[Chat API] 读取图片附件失败: ${attRecord.fileName}`, err);
            }
          }
        }
      } else {
        try {
          const filePath = path.join(AppPaths.uploadsDir, path.basename(attRecord.url || ''));
          const ext = path.extname(attRecord.fileName || '').toLowerCase().replace('.', '');
          const fileContent = await extractFileContent(filePath, ext, attRecord.fileName || '');
          contentParts.push({ type: 'text', text: fileContent });
        } catch (err: any) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
            logger.error(`[Chat API] 读取文件附件失败: ${attRecord.fileName}`, err);
            contentParts.push({ type: 'text', text: `\n---\n[附件: ${attRecord.fileName} - 读取失败]\n---\n` });
          }
        }
      }
    }

    apiMessages.push({ role: 'user', content: contentParts });
  } else {
    apiMessages.push({ role: 'user', content: message });
  }

  // 8. 历史消息消毒
  let maxHistoryTurns = 0;
  let imageLimits = {};
  let dropReasoning = false;
  try {
    const settingsVal = getAppSettings('default');
    if (settingsVal) {
      const parsed = JSON.parse(settingsVal);
      if (parsed?.aiEngine?.maxHistoryTurns && parsed.aiEngine.maxHistoryTurns > 0) {
        maxHistoryTurns = parsed.aiEngine.maxHistoryTurns;
      }
      imageLimits = resolveImageSanitizationLimits(parsed);
      if (modelConfig.capabilities && !modelConfig.capabilities.includes('reasoning')) {
        dropReasoning = true;
      }
    }
  } catch { /* ignore */ }
  const sanitized = sanitizeHistoryMessages(apiMessages, {
    maxTurns: maxHistoryTurns,
    imageLimits,
    dropReasoning,
  });

  // 9. 上下文压缩
  const ctxWindow = (finalModelConfig as ModelCallConfig).contextWindow || 128000;
  const ctxMaxTokens = Math.min((finalModelConfig as ModelCallConfig).maxTokens || 8192, 8192);
  let truncated: { messages: ApiMessage[]; truncated: boolean };
  try {
    const compressResult = await compressContextWithSummary(
      sanitized, ctxWindow, ctxMaxTokens, 30, finalModelConfig,
      undefined, undefined, undefined, { sessionId: params.sessionId },
    );
    truncated = { messages: compressResult.messages, truncated: compressResult.truncated || compressResult.compressed };
    if (compressResult.compressed) {
      logger.debug('[Chat API] 上下文已智能压缩');
    }
  } catch {
    truncated = truncateContextForModel(sanitized, ctxWindow, ctxMaxTokens, 30);
  }

  // 10. tool_calls 配对校验
  truncated.messages = validateToolCallsPairing(truncated.messages);

  return {
    apiMessages: truncated.messages,
  };
}

export { hasImageAttachment, detectVisionModel, parseMessageAttachments, rebuildToolCallsFromMessage, validateToolCallsPairing };
