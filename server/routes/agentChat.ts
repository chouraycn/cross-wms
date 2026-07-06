/**
 * Agent Chat API — 统一的聊天入口（推荐使用）
 *
 * 架构定位：
 * - 这是 cross-wms 聊天功能的标准入口
 * - 输出 AgentEventPayload 格式（与 openclaw 事件模型对齐）
 * - 底层调用 runChatSession 执行实际的 LLM 对话（纯回调驱动，无 Proxy 转换层）
 * - 旧版 /api/chat 保留兼容，但新代码应使用本接口
 *
 * 事件格式（AgentEventPayload）：
 * - lifecycle.start / lifecycle.init / lifecycle.done
 * - text.delta / text.block（正文流）
 * - thinking.delta / thinking.block（思考流）
 * - tool.call / tool.result（工具调用）
 * - error（错误）
 *
 * 执行路径：
 *   前端 → agentChat.ts → runChatSession → streamExecutor.executeChat
 *   （无 Proxy 层、无 SSE 解析往返、单层事件转换）
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { runChatSession } from '../engine/runChatSession.js';
import {
  registerAgentRunContext,
  clearAgentRunContext,
  nextSeqForRun,
  nextSeqForRunAndStream,
  getAgentRunContext,
  listAgentRunsForSession,
  type AgentEventPayload,
  type AgentEventStream,
} from '../engine/agentEvents.js';
import type { Response, Request } from 'express';
import { getSessionMessages } from '../dao/chat.js';
import { FileStorage } from '../storage/FileStorage.js';

const router = Router();

// ===================== 事件发送工具 =====================

function createAgentEventSender(res: Response, params: {
  runId: string;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  userId?: string;
}) {
  const { runId, sessionKey, sessionId, agentId, userId } = params;

  const send = (
    stream: AgentEventStream,
    data: Record<string, unknown>,
    useStreamSeq: boolean = false,
  ) => {
    const seq = useStreamSeq
      ? nextSeqForRunAndStream(runId, stream)
      : nextSeqForRun(runId);

    const payload: AgentEventPayload = {
      runId,
      seq,
      stream,
      ts: Date.now(),
      data,
      ...(sessionKey ? { sessionKey } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(agentId ? { agentId } : {}),
      ...(userId ? { userId } : {}),
    };

    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // 连接已断开，忽略
      }
    }
  };

  return { send };
}

// ===================== 主接口：Agent Chat (SSE) =====================

export async function handleAgentChat(req: Request, res: Response) {
  const sessionId = req.body.sessionId || `sess_${uuidv4().slice(0, 8)}`;
  const message = req.body.message || '';
  const runId = `run_${uuidv4().slice(0, 12)}`;
  const sessionKey = sessionId;
  const agentId = req.body.agentId;
  const userId = req.body.userId;
  const model = req.body.model;
  const preset = req.body.preset;
  const skillContext = req.body.skillContext;
  const skillId = req.body.skillId;
  const attachments = req.body.attachments;
  const conversationHistory = req.body.conversationHistory;
  const executionMode = req.body.executionMode;
  const referencedSessionIds = req.body.referencedSessionIds;
  const thinkingLevel = req.body.thinkingLevel;

  if (!message.trim()) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  try {
    registerAgentRunContext(runId, {
      sessionKey,
      sessionId,
      agentId,
      userId,
      registeredAt: Date.now(),
      lastActiveAt: Date.now(),
    });

    const { send } = createAgentEventSender(res, {
      runId,
      sessionKey,
      sessionId,
      agentId,
      userId,
    });

    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // 发送 lifecycle.start
    send('lifecycle', {
      phase: 'start',
      sessionId,
    });

    // 处理客户端断开
    // 注意：必须用 res.on('close') 而非 req.on('close')
    // req.on('close') 在请求体被 JSON 中间件消费后立即触发，会导致 aborted=true
    // 从而跳过所有后续 SSE 事件（AI 实际在生成但前端收不到）
    let aborted = false;
    res.on('close', () => {
      aborted = true;
      clearAgentRunContext(runId);
    });

    // 直接调用 runChatSession
    await runChatSession(
      {
        sessionId,
        message,
        model,
        preset,
        skillContext,
        skillId,
        attachments,
        conversationHistory,
        executionMode,
        agentId,
        referencedSessionIds,
        userId,
        thinkingLevel,
      },
      {
        onEvent: (event) => {
          if (aborted) return;
          const eventType = event.type as string;
          switch (eventType) {
            case 'init':
              send('lifecycle', {
                phase: 'init',
                assistantMessageId: event.assistantMessageId,
                model: event.model,
                modelName: event.modelName,
                autoReason: event.autoReason,
                autoReasonType: event.autoReasonType,
              });
              break;
            case 'text':
              send('assistant', { content: (event.content as string) || '' }, true);
              break;
            case 'thinking':
              send('thinking', { content: (event.content as string) || '' }, true);
              break;
            case 'tool_call':
              send('tool', {
                toolCallId: event.toolCallId || event.id,
                name: event.toolName || event.tool,
                args: event.toolArgs || event.args,
                result: event.toolResult ?? event.result,
              });
              break;
            case 'error':
              send('error', {
                code: event.code || 'UNKNOWN_ERROR',
                message: event.message || '发生错误',
              });
              break;
            case 'done':
              send('lifecycle', {
                phase: 'done',
                thinkingDuration: event.thinkingDuration,
                usage: event.usage,
                errorCode: event.errorCode,
                errorMessage: event.errorMessage,
                fallbackModel: event.fallbackModel,
                fallbackReason: event.fallbackReason,
              });
              break;
            case 'compaction':
              send('compaction', {
                tokensBefore: event.tokensBefore,
                tokensAfter: event.tokensAfter,
                reductionRatio: event.reductionRatio,
              });
              break;
            default:
              // 调试事件
              send('debug' as AgentEventStream, event);
              break;
          }
        },
      },
    );

    if (!res.writableEnded) {
      try {
        res.end();
      } catch { /* ignore */ }
    }

    clearAgentRunContext(runId);

  } catch (error) {
    logger.error('[AgentChat] 处理请求失败:', error);

    const errorPayload: AgentEventPayload = {
      runId,
      seq: nextSeqForRun(runId),
      stream: 'error',
      ts: Date.now(),
      data: {
        code: (error as any).code || 'SERVER_ERROR',
        message: (error as Error).message || '服务器内部错误',
      },
      sessionKey,
      sessionId,
      ...(agentId ? { agentId } : {}),
      ...(userId ? { userId } : {}),
    };

    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify(errorPayload)}\n\n`);
        res.end();
      } catch { /* ignore */ }
    }

    clearAgentRunContext(runId);
  }
}

router.post('/agent-chat', handleAgentChat);

// ===================== 辅助接口 =====================

router.get('/agent-run/status/:runId', (req, res) => {
  const { runId } = req.params;
  const ctx = getAgentRunContext(runId);
  res.json({
    runId,
    exists: !!ctx,
    context: ctx,
  });
});

router.get('/agent-run/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const runs = listAgentRunsForSession(sessionId);
  res.json({
    sessionId,
    runs,
  });
});

// ===================== 对话压缩 API =====================

function generateSmartSummary(messages: Array<{ role: string; content: string }>): string {
  const userMsgs = messages.filter(m => m.role === 'user');
  const assistantMsgs = messages.filter(m => m.role === 'assistant');

  const keyPoints: string[] = [];

  if (userMsgs.length > 0) {
    keyPoints.push(`**用户需求**：${userMsgs[0].content.slice(0, 100)}${userMsgs[0].content.length > 100 ? '...' : ''}`);
  }

  let totalQueries = 0;
  let totalOperations = 0;
  const topics = new Set<string>();

  for (const msg of messages) {
    const content = msg.content || '';
    if (content.includes('查询') || content.includes('库存') || content.includes('查询')) totalQueries++;
    if (content.includes('创建') || content.includes('更新') || content.includes('删除') || content.includes('操作')) totalOperations++;

    const topicMatches = content.match(/库存|入库|出库|调拨|盘点|补货|预警|报表/gi);
    if (topicMatches) {
      topicMatches.forEach(t => topics.add(t));
    }
  }

  keyPoints.push(`**对话统计**：共 ${messages.length} 条消息（用户 ${userMsgs.length} 条，AI ${assistantMsgs.length} 条）`);

  if (totalQueries > 0 || totalOperations > 0) {
    keyPoints.push(`**操作概览**：查询类 ${totalQueries} 次，操作类 ${totalOperations} 次`);
  }

  if (topics.size > 0) {
    keyPoints.push(`**涉及主题**：${Array.from(topics).slice(0, 5).join('、')}`);
  }

  if (userMsgs.length > 1) {
    const lastUser = userMsgs[userMsgs.length - 1];
    keyPoints.push(`**最后用户问题**：${lastUser.content.slice(0, 80)}${lastUser.content.length > 80 ? '...' : ''}`);
  }

  if (assistantMsgs.length > 0) {
    const lastAssistant = assistantMsgs[assistantMsgs.length - 1];
    keyPoints.push(`**最新进展**：${lastAssistant.content.slice(0, 80)}${lastAssistant.content.length > 80 ? '...' : ''}`);
  }

  return keyPoints.join('\n\n');
}

// ===================== 压缩安全净化 =====================

/** 保留消息中 toolCalls.result 的最大字节数（约 1KB），超出截断 */
const KEPT_TOOL_RESULT_MAX_BYTES = 1024;
/** 保留消息中 thinking 的最大字节数（约 2KB），超出截断 */
const KEPT_THINKING_MAX_BYTES = 2 * 1024;

/**
 * 压缩后保留消息的安全净化：
 * 1. 截断 toolCalls 中每条 result 到 KEPT_TOOL_RESULT_MAX_BYTES
 * 2. 移除 toolCall entry 中的 details 字段（若存在，避免结构化大对象残留）
 * 3. 截断 thinking 字段到 KEPT_THINKING_MAX_BYTES
 * 4. 修复孤儿 tool_result：移除没有 name/id 的无效 toolCall 条目
 *
 * 注意：此函数不修改原数组，返回新数组。
 */
function sanitizeKeptMessages(messages: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
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
            // 移除 details 字段（结构化大对象，压缩后无需保留）
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

router.post('/agent-compact', async (req: Request, res: Response) => {
  const sessionId = req.body.sessionId;
  const preserveCount = req.body.preserveCount ?? 6;

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId 不能为空' });
    return;
  }

  try {
    const messages = getSessionMessages(sessionId);
    if (messages.length < preserveCount + 2) {
      res.json({
        success: true,
        compressed: false,
        reason: '消息数量不足，无需压缩',
        messageCount: messages.length,
      });
      return;
    }

    const preserveStart = Math.max(0, messages.length - preserveCount);
    const toCompress = messages.slice(0, preserveStart);
    const toKeep = messages.slice(preserveStart);

    if (toCompress.length === 0) {
      res.json({
        success: true,
        compressed: false,
        reason: '没有需要压缩的消息',
        messageCount: messages.length,
      });
      return;
    }

    const compressMsgs = toCompress.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }));

    const summary = generateSmartSummary(compressMsgs);

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

    // 安全净化：截断保留消息中的 toolCalls.result 和 thinking，移除 details 字段
    // 避免压缩后的会话文件仍因大 tool result 而膨胀
    const sanitizedKept = sanitizeKeptMessages(toKeep as unknown as Array<Record<string, unknown>>);

    const newMessages = [summaryMessage as any, ...sanitizedKept];

    try {
      const lines = FileStorage.readSessionLines(sessionId);
      if (lines.length === 0) {
        res.status(404).json({ error: '会话不存在' });
        return;
      }
      const firstLine = lines[0] as any;
      if (firstLine.session) {
        firstLine.session.updatedAt = new Date().toISOString();
      }
      firstLine.messages = newMessages;

      FileStorage.deleteSessionFile(sessionId);
      FileStorage.appendSessionLine(sessionId, firstLine);
    } catch (writeErr) {
      logger.error('[AgentCompact] 写入压缩后消息失败：', writeErr);
      res.status(500).json({ error: '写入压缩结果失败' });
      return;
    }

    res.json({
      success: true,
      compressed: true,
      beforeCount: messages.length,
      afterCount: newMessages.length,
      compressedCount: toCompress.length,
      preservedCount: toKeep.length,
      summary,
    });
  } catch (error) {
    logger.error('[AgentCompact] 压缩失败:', error);
    res.status(500).json({
      error: '对话压缩失败',
      details: (error as Error).message,
    });
  }
});

export default router;
