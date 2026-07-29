/**
 * 对话压缩入口模块
 *
 * 架构定位：
 * - 作为 POST /api/agent-compact 的业务逻辑入口
 * - 当前使用基于规则的智能摘要（generateSmartSummary）
 * - 未来可桥接到 OpenClaw LLM 压缩引擎（compactEmbeddedAgentSessionDirect）
 *
 * 压缩规则（项目硬约束）：
 * - 保留最近 6 条消息
 * - 压缩历史为单一摘要，包含：用户需求、对话统计、操作概览、WMS主题、最后问题、最新进展
 */

import { v4 as uuidv4 } from 'uuid';
import { getSessionMessages } from '../../dao/chat.js';
import { FileStorage } from '../../storage/FileStorage.js';
import { logger } from '../../logger.js';

// ===================== 类型定义 =====================

export interface CompactMessage {
  role: string;
  content: string;
}

export interface CompactResult {
  success: boolean;
  compressed: boolean;
  reason?: string;
  messageCount?: number;
  beforeCount?: number;
  afterCount?: number;
  compressedCount?: number;
  preservedCount?: number;
  summary?: string;
}

// ===================== 常量 =====================

/** 保留最近消息条数（项目硬约束：6 条） */
export const DEFAULT_PRESERVE_COUNT = 6;

/** 保留消息中 toolCalls.result 的最大字节数（约 1KB），超出截断 */
const KEPT_TOOL_RESULT_MAX_BYTES = 1024;

/** 保留消息中 thinking 的最大字节数（约 2KB），超出截断 */
const KEPT_THINKING_MAX_BYTES = 2 * 1024;

// ===================== 智能摘要生成 =====================

/**
 * 基于规则生成对话摘要，覆盖 6 个必填字段：
 * 1. 用户需求 — 第一条用户消息
 * 2. 对话统计 — 消息总数及角色分布
 * 3. 操作概览 — 查询类/操作类次数
 * 4. 涉及主题 — WMS 领域关键词
 * 5. 最后用户问题 — 最近一条用户消息
 * 6. 最新进展 — 最近一条 AI 消息
 */
export function generateSmartSummary(messages: CompactMessage[]): string {
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');

  const keyPoints: string[] = [];

  // 1. 用户需求
  if (userMsgs.length > 0) {
    keyPoints.push(`**用户需求**：${userMsgs[0].content.slice(0, 100)}${userMsgs[0].content.length > 100 ? '...' : ''}`);
  }

  // 2. 操作概览（统计查询类和操作类）
  let totalQueries = 0;
  let totalOperations = 0;
  const topics = new Set<string>();

  for (const msg of messages) {
    const content = msg.content || '';
    if (content.includes('查询') || content.includes('库存')) totalQueries++;
    if (content.includes('创建') || content.includes('更新') || content.includes('删除') || content.includes('操作')) totalOperations++;

    const topicMatches = content.match(/库存|入库|出库|调拨|盘点|补货|预警|报表/gi);
    if (topicMatches) {
      topicMatches.forEach(t => topics.add(t));
    }
  }

  // 3. 对话统计
  keyPoints.push(`**对话统计**：共 ${messages.length} 条消息（用户 ${userMsgs.length} 条，AI ${assistantMsgs.length} 条）`);

  // 4. 操作概览
  if (totalQueries > 0 || totalOperations > 0) {
    keyPoints.push(`**操作概览**：查询类 ${totalQueries} 次，操作类 ${totalOperations} 次`);
  }

  // 5. 涉及主题
  if (topics.size > 0) {
    keyPoints.push(`**涉及主题**：${Array.from(topics).slice(0, 5).join('、')}`);
  }

  // 6. 最后用户问题
  if (userMsgs.length > 1) {
    const lastUser = userMsgs[userMsgs.length - 1];
    keyPoints.push(`**最后用户问题**：${lastUser.content.slice(0, 80)}${lastUser.content.length > 80 ? '...' : ''}`);
  }

  // 7. 最新进展
  if (assistantMsgs.length > 0) {
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    keyPoints.push(`**最新进展**：${lastAssistant.content.slice(0, 80)}${lastAssistant.content.length > 80 ? '...' : ''}`);
  }

  return keyPoints.join('\n\n');
}

// ===================== 压缩安全净化 =====================

/**
 * 压缩后保留消息的安全净化：
 * 1. 截断 toolCalls 中每条 result 到 KEPT_TOOL_RESULT_MAX_BYTES
 * 2. 移除 toolCall entry 中的 details 字段（避免结构化大对象残留）
 * 3. 截断 thinking 字段到 KEPT_THINKING_MAX_BYTES
 * 4. 修复孤儿 tool_result：移除没有 name/id 的无效 toolCall 条目
 *
 * 注意：此函数不修改原数组，返回新数组。
 */
export function sanitizeKeptMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return messages.map((msg) => {
    const next: Record<string, unknown> = { ...msg };

    // 净化 toolCalls
    const toolCallsRaw = next.toolCalls;
    if (typeof toolCallsRaw === 'string' && toolCallsRaw.length > 0) {
      try {
        const arr = JSON.parse(toolCallsRaw);
        if (Array.isArray(arr)) {
          const sanitized: unknown[] = [];
          for (const tc of arr) {
            if (!tc || typeof tc !== 'object') continue;
            const entry = tc as Record<string, unknown>;
            // 修复孤儿条目：必须有 name 字段才算有效
            if (!entry.name || typeof entry.name !== 'string') continue;

            const cleaned: Record<string, unknown> = { ...entry };
            // 移除 details 字段
            delete cleaned.details;

            // 截断 result
            const result = cleaned.result;
            if (typeof result === 'string' && Buffer.byteLength(result, 'utf-8') > KEPT_TOOL_RESULT_MAX_BYTES) {
              const origKB = (Buffer.byteLength(result, 'utf-8') / 1024).toFixed(1);
              cleaned.result = result.slice(0, KEPT_TOOL_RESULT_MAX_BYTES) +
                `\n\n[压缩时已截断，原大小 ${origKB} KB]`;
            }
            sanitized.push(cleaned);
          }
          next.toolCalls = JSON.stringify(sanitized);
        }
      } catch {
        // 解析失败，保留原值
      }
    }

    // 截断 thinking
    const thinking = next.thinking;
    if (typeof thinking === 'string' && Buffer.byteLength(thinking, 'utf-8') > KEPT_THINKING_MAX_BYTES) {
      const origKB = (Buffer.byteLength(thinking, 'utf-8') / 1024).toFixed(1);
      next.thinking = thinking.slice(0, KEPT_THINKING_MAX_BYTES) +
        `\n\n[压缩时已截断，原大小 ${origKB} KB]`;
    }

    return next;
  });
}

// ===================== 核心压缩入口 =====================

/**
 * 压缩对话会话
 *
 * @param sessionId 会话 ID
 * @param preserveCount 保留最近消息条数（默认 6）
 * @returns 压缩结果
 *
 * 执行流程：
 * 1. 读取会话消息
 * 2. 消息不足时跳过压缩
 * 3. 切分压缩区/保留区
 * 4. 生成摘要
 * 5. 净化保留消息
 * 6. 重写会话文件
 */
export async function compactSession(
  sessionId: string,
  preserveCount: number = DEFAULT_PRESERVE_COUNT,
): Promise<CompactResult> {
  const messages = getSessionMessages(sessionId);

  // 消息不足，无需压缩
  if (messages.length < preserveCount + 2) {
    return {
      success: true,
      compressed: false,
      reason: '消息数量不足，无需压缩',
      messageCount: messages.length,
    };
  }

  const preserveStart = Math.max(0, messages.length - preserveCount);
  const toCompress = messages.slice(0, preserveStart);
  const toKeep = messages.slice(preserveStart);

  // 没有需要压缩的消息
  if (toCompress.length === 0) {
    return {
      success: true,
      compressed: false,
      reason: '没有需要压缩的消息',
      messageCount: messages.length,
    };
  }

  // 生成摘要
  const compressMsgs: CompactMessage[] = toCompress.map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }));
  const summary = generateSmartSummary(compressMsgs);

  // 构造摘要消息
  const summaryMessage = {
    id: `msg_${uuidv4().slice(0, 8)}`,
    role: 'assistant',
    content: `**📝 对话压缩摘要**\n\n${summary}\n\n---\n*已压缩 ${toCompress.length} 条历史消息，保留最近 ${toKeep.length} 条消息*`,
    model: '',
    timestamp: new Date().toISOString(),
    thinking: '',
    thinkingDone: false,
    isCompressedSummary: true,
  };

  // 安全净化保留消息
  const sanitizedKept = sanitizeKeptMessages(toKeep as unknown as Array<Record<string, unknown>>);
  const newMessages = [summaryMessage, ...sanitizedKept];

  // 重写会话文件
  try {
    const lines = FileStorage.readSessionLines(sessionId);
    if (lines.length === 0) {
      return {
        success: false,
        compressed: false,
        reason: '会话不存在',
      };
    }
    const firstLine = lines[0] as Record<string, unknown>;
    const session = firstLine.session as Record<string, unknown> | undefined;
    if (session) {
      session.updatedAt = new Date().toISOString();
    }
    firstLine.messages = newMessages;

    FileStorage.deleteSessionFile(sessionId);
    FileStorage.appendSessionLine(sessionId, firstLine);
  } catch (writeErr) {
    logger.error('[compactSession] 写入压缩后消息失败：', writeErr);
    return {
      success: false,
      compressed: false,
      reason: '写入压缩结果失败',
    };
  }

  logger.info(`[compactSession] 会话 ${sessionId} 压缩完成: ${messages.length} → ${newMessages.length} 条消息`);

  return {
    success: true,
    compressed: true,
    beforeCount: messages.length,
    afterCount: newMessages.length,
    compressedCount: toCompress.length,
    preservedCount: toKeep.length,
    summary,
  };
}

// ===================== OpenClaw 桥接（预留） =====================

/**
 * 预留：桥接到 OpenClaw LLM 压缩引擎
 *
 * 当以下条件满足时可启用：
 * 1. OpenClaw config/provider/model 系统完整初始化
 * 2. SessionManager + transcript 文件格式适配完成
 * 3. CompactEmbeddedAgentSessionParams 构造就绪
 *
 * 启用方式：
 * - 检测 LLM 引擎可用时，compactSession 改为委托调用
 * - compactEmbeddedAgentSessionDirect（直调）或 compactEmbeddedAgentSession（队列）
 * - 适配 EmbeddedAgentCompactResult → CompactResult
 */
export function compactEmbeddedAgentSessionDirect(..._args: unknown[]): unknown {
  // 降级 stub：LLM 压缩引擎未启用
  // 当前使用 compactSession 的规则摘要作为替代
  return undefined;
}

export const testing_compact: unknown = undefined;
