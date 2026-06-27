/**
 * Agent Chat API — 基于 OpenClaw 事件驱动架构
 *
 * v1.0: 基于现有 chatService 封装，输出标准 Agent 事件格式
 * - 拦截 chatService 的 SSE 输出，转换为 AgentEventPayload 格式
 * - 支持思考流与正文流独立序列号
 *
 * 后续版本将逐步替换底层为完整的 AgentRuntime。
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../logger.js';
import { handleChat } from './chatService.js';
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

// ===================== 块缓冲合并器 =====================

interface BlockBuffer {
  content: string;
  timer: ReturnType<typeof setTimeout> | null;
  lastEnqueueAt: number;
}

const BLOCK_CONFIG = {
  minChars: 200,
  maxChars: 1000,
  idleMs: 150,
};

const THINKING_BLOCK_CONFIG = {
  minChars: 150,
  maxChars: 800,
  idleMs: 100,
};

function createBlockBuffer(
  stream: AgentEventStream,
  sendFn: (content: string) => void,
  config: typeof BLOCK_CONFIG,
): { enqueue: (content: string) => void; flush: () => void; dispose: () => void } {
  const buffer: BlockBuffer = {
    content: '',
    timer: null,
    lastEnqueueAt: 0,
  };

  const flush = () => {
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }
    if (!buffer.content) return;
    const content = buffer.content;
    buffer.content = '';
    sendFn(content);
  };

  const scheduleFlush = () => {
    if (buffer.timer) clearTimeout(buffer.timer);

    const delay = buffer.content.length < config.minChars
      ? config.idleMs * 1.5
      : config.idleMs;

    buffer.timer = setTimeout(() => {
      flush();
    }, delay);
  };

  const enqueue = (content: string) => {
    if (!content) return;
    buffer.content += content;
    buffer.lastEnqueueAt = Date.now();

    if (buffer.content.length >= config.maxChars) {
      flush();
      return;
    }

    scheduleFlush();
  };

  const dispose = () => {
    flush();
    if (buffer.timer) {
      clearTimeout(buffer.timer);
      buffer.timer = null;
    }
  };

  return { enqueue, flush, dispose };
}

// ===================== 事件转换工具 =====================

function createEventTransformProxy(
  originalRes: Response,
  params: {
    runId: string;
    sessionKey?: string;
    sessionId?: string;
    agentId?: string;
    userId?: string;
  },
): { proxyRes: Response; dispose: () => void } {
  const { runId, sessionKey, sessionId, agentId, userId } = params;

  const sendAgentEvent = (
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

    if (!originalRes.writableEnded) {
      try {
        originalRes.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        // 连接已断开，忽略
      }
    }
  };

  // 正文流块缓冲
  const textBlockBuffer = createBlockBuffer(
    'assistant',
    (content) => {
      sendAgentEvent('assistant', { content }, true);
    },
    BLOCK_CONFIG,
  );

  // 思考流块缓冲
  const thinkingBlockBuffer = createBlockBuffer(
    'thinking',
    (content) => {
      sendAgentEvent('thinking', { content }, true);
    },
    THINKING_BLOCK_CONFIG,
  );

  const flushAllBuffers = () => {
    textBlockBuffer.flush();
    thinkingBlockBuffer.flush();
  };

  const dispose = () => {
    textBlockBuffer.dispose();
    thinkingBlockBuffer.dispose();
  };

  // 跟踪是否已设置响应头
  let headersSet = false;

  // 创建代理 res 对象，拦截 write 和 setHeader/flushHeaders 方法
  const proxyRes = new Proxy(originalRes, {
    get(target, prop, receiver) {
      if (prop === 'write') {
        return (chunk: any, encoding?: any, callback?: any) => {
          try {
            // 确保响应头已设置（在第一次 write 时）
            if (!headersSet) {
              headersSet = true;
              // 发送 lifecycle.start 事件（通过 handleChat 的 init 事件转换）
              sendAgentEvent('lifecycle', {
                phase: 'start',
                sessionId: params.sessionId,
              });
            }

            const text = typeof chunk === 'string' ? chunk : chunk?.toString?.();
            if (!text) return true;

            // 解析 SSE 事件
            const lines = text.split('\n\n').filter(Boolean);
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6);
              let event: any;
              try {
                event = JSON.parse(jsonStr);
              } catch {
                continue;
              }

              const eventType = event.type;
              switch (eventType) {
                case 'init':
                  sendAgentEvent('lifecycle', {
                    phase: 'init',
                    assistantMessageId: event.assistantMessageId,
                    model: event.model,
                    modelName: event.modelName,
                    autoReason: event.autoReason,
                    autoReasonType: event.autoReasonType,
                  });
                  break;
                case 'text':
                  textBlockBuffer.enqueue(event.content || '');
                  break;
                case 'thinking':
                  thinkingBlockBuffer.enqueue(event.content || '');
                  break;
                case 'tool_call':
                  flushAllBuffers();
                  sendAgentEvent('tool', {
                    toolCallId: event.toolCallId || event.id,
                    name: event.toolName || event.tool,
                    args: event.toolArgs || event.args,
                    result: event.result,
                  });
                  break;
                case 'error':
                  flushAllBuffers();
                  sendAgentEvent('error', {
                    code: event.code || 'UNKNOWN_ERROR',
                    message: event.message || '发生错误',
                  });
                  break;
                case 'done':
                  flushAllBuffers();
                  sendAgentEvent('lifecycle', {
                    phase: 'done',
                    thinkingDuration: event.thinkingDuration,
                    usage: event.usage,
                    errorCode: event.errorCode,
                    errorMessage: event.errorMessage,
                    fallbackModel: event.fallbackModel,
                    fallbackReason: event.fallbackReason,
                  });
                  break;
                default:
                  // 调试事件
                  sendAgentEvent('debug' as AgentEventStream, event);
                  break;
              }
            }
            return true;
          } catch (e) {
            logger.error('[AgentChat] 事件转换失败:', e);
            return true;
          }
        };
      }

      // 转发其他方法到原始 res
      return Reflect.get(target, prop, receiver);
    },
  });

  return { proxyRes, dispose };
}

// ===================== 主接口：Agent Chat (SSE) =====================

export async function handleAgentChat(req: Request, res: Response) {
  const sessionId = req.body.sessionId || `sess_${uuidv4().slice(0, 8)}`;
  const message = req.body.message || '';
  const runId = `run_${uuidv4().slice(0, 12)}`;
  const sessionKey = sessionId;
  const agentId = req.body.agentId;
  const userId = req.body.userId;

  if (!message.trim()) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  try {
    // 注册运行上下文
    registerAgentRunContext(runId, {
      sessionKey,
      sessionId,
      agentId,
      userId,
      registeredAt: Date.now(),
      lastActiveAt: Date.now(),
    });

    // 创建代理 res，将 chatService 的 SSE 事件转换为 Agent 事件格式
    // 代理会拦截 setHeader/flushHeaders 调用，确保只设置一次
    const { proxyRes, dispose: disposeBuffers } = createEventTransformProxy(res, {
      runId,
      sessionKey,
      sessionId,
      agentId,
      userId,
    });

    // 处理客户端断开
    req.on('close', () => {
      disposeBuffers();
      clearAgentRunContext(runId);
    });

    // 调用 chatService 的 handleChat
    // handleChat 会设置响应头并发送 init 事件
    await handleChat(req, proxyRes);

    disposeBuffers();
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

    const newMessages = [summaryMessage as any, ...toKeep];

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
