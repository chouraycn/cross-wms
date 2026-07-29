/**
 * Agent Chat API — 统一的聊天入口（推荐使用）
 *
 * 架构定位：
 * - 这是 cdf-know 聊天功能的标准入口
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
import {
  extractThinkingDirectives,
  applyThinkingDirectives,
  thinkingModeManager,
} from '../engine/thinkingMode.js';
import type { Response, Request } from 'express';
import { compactSession, type CompactResult } from '../engine/agents/compact.js';

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
    // 提取并应用思考指令
    const { cleanedInput, directives } = extractThinkingDirectives(message);
    if (directives.length > 0) {
      applyThinkingDirectives(sessionId, directives);
      logger.info(`Applied thinking directives for session ${sessionId}:`, directives);
    }

    // 使用清理后的消息（移除指令）
    const processedMessage = cleanedInput || message;
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
        message: processedMessage,
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
                autoSemanticMethod: event.autoSemanticMethod,
                autoSemanticConfidence: event.autoSemanticConfidence,
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
            case 'file':
              // 技能/工具产出文件实时回写（T1）：透传到前端 file 流
              send('file', {
                fileId: event.fileId,
                toolCallId: event.toolCallId,
                source: event.source,
                skillId: event.skillId,
                fileName: event.fileName,
                mimeType: event.mimeType,
                fileSize: event.fileSize,
                downloadUrl: event.downloadUrl,
                previewUrl: event.previewUrl,
                description: event.description,
                sessionId: event.sessionId,
                createdAt: event.createdAt,
              });
              break;
            case 'compaction':
              send('compaction', {
                tokensBefore: event.tokensBefore,
                tokensAfter: event.tokensAfter,
                reductionRatio: event.reductionRatio,
              });
              break;
            case 'output_review':
              send('output_review', {
                quality: event.quality,
                issues: event.issues,
                suggestion: event.suggestion,
              });
              break;
            case 'compaction_notification':
              send('compaction_notification', {
                notification: event.notification,
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

router.post('/agent-compact', async (req: Request, res: Response) => {
  const sessionId = req.body.sessionId;
  const preserveCount = req.body.preserveCount ?? 6;

  if (!sessionId) {
    res.status(400).json({ error: 'sessionId 不能为空' });
    return;
  }

  try {
    const result: CompactResult = await compactSession(sessionId, preserveCount);

    if (!result.success) {
      const statusCode = result.reason === '会话不存在' ? 404 : 500;
      res.status(statusCode).json({ error: result.reason });
      return;
    }

    res.json(result);
  } catch (error) {
    logger.error('[AgentCompact] 压缩失败:', error);
    res.status(500).json({
      error: '对话压缩失败',
      details: (error as Error).message,
    });
  }
});

export default router;
