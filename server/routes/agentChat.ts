/**
 * Agent Chat API — 基于 OpenClaw 事件驱动架构
 *
 * 与旧版 /chat 的区别：
 * 1. 使用 AgentRuntime + AgentEvents 事件系统
 * 2. 传输层与业务逻辑解耦
 * 3. 丰富的事件类型（item/approval/command_output/patch 等）
 * 4. 支持多订阅者模式
 *
 * 向后兼容：通过 SSE 传输 Agent 事件，前端可逐步迁移
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  startAgentRun,
  abortAgentRun,
  getActiveRunCount,
  bridgeAgentEventsToSSE,
} from '../engine/agentRuntime.js';
import {
  listAgentRunsForSession,
  getAgentRunContext,
} from '../engine/agentEvents.js';
import { logger } from '../logger.js';
import { ExecutionMode } from '../engine/executionStrategy.js';
import {
  getSessions,
  createSession,
  getSessionMessages,
  addMessage,
} from '../dao/chat.js';
import { loadModelsConfig, type ModelConfig } from '../modelsStore.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import { autoSelectModel, isModelAvailable } from './modelSelector.js';
import { extractFileContent } from './chatHelpers/fileExtractor.js';
import { extractAndAppendMemory } from './memoryExtractor.js';
import { buildSoulSystemMessage } from '../engine/soulLoader.js';
import { sanitizeToolMessages } from '../engine/contextTruncate.js';
import { formatMemoryContext } from '../engine/contextEnhancer.js';
import { AIAPIError, type MessageContent } from '../aiClient.js';
import type { Attachment } from '../types/chat.js';

const router = Router();

// ===================== 类型定义 =====================

export interface AgentChatRequest {
  sessionId?: string;
  message: string;
  model?: string;
  attachments?: Attachment[];
  skillContext?: string;
  skillId?: string;
  referencedSessionIds?: string[];
  executionMode?: 'legacy' | 'observer' | 'react' | 'agent';
  agentId?: string;
  userId?: string;
  queueMode?: 'collect' | 'steer' | 'followup';
}

export interface AgentChatInitResponse {
  runId: string;
  sessionId: string;
  assistantMessageId: string;
  model: string;
  modelName: string;
}

// ===================== 工具函数 =====================

function hasImageAttachment(attachments: unknown[] | undefined): boolean {
  return !!(
    attachments &&
    Array.isArray(attachments) &&
    attachments.some((att) => (att as { type: string }).type === 'image')
  );
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

// ===================== 主接口：Agent Chat (SSE) =====================

export async function handleAgentChat(req: import('express').Request, res: import('express').Response) {
  const sessionId = req.body.sessionId || `sess_${uuidv4().slice(0, 8)}`;
  const message = req.body.message || '';
  const requestedModel = req.body.model || 'auto';
  const attachments = req.body.attachments as Attachment[] | undefined;
  const skillContext = req.body.skillContext as string | undefined;
  const skillId = req.body.skillId as string | undefined;
  const referencedSessionIds = req.body.referencedSessionIds as string[] | undefined;
  const executionMode = (req.body.executionMode as ExecutionMode) || ExecutionMode.REACT;
  const agentId = req.body.agentId as string | undefined;
  const userId = req.body.userId as string | undefined;

  if (!message.trim()) {
    res.status(400).json({ error: '消息内容不能为空' });
    return;
  }

  try {
    // 设置 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const hasVision = hasImageAttachment(attachments);

    const modelsConfig = loadModelsConfig();
    const modelResult = autoSelectModel(requestedModel, modelsConfig, hasVision);
    const modelConfig = modelResult.config;
    const modelId = modelConfig.id;
    const modelName = modelConfig.name || modelConfig.id;

    let session = getSessions().find((s) => s.id === sessionId);
    const isNewSession = !session;
    if (isNewSession) {
      session = createSession({
        id: sessionId,
        title: message.slice(0, 30),
        model: modelId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      });
    }

    const userMessageId = `msg_${uuidv4().slice(0, 8)}`;
    const assistantMessageId = `msg_${uuidv4().slice(0, 8)}`;

    const userMsg = {
      id: userMessageId,
      role: 'user' as const,
      content: message,
      model: modelId,
      timestamp: Date.now(),
      attachments: attachments?.map((a) => ({
        id: a.id,
        type: a.type,
        name: a.name,
        url: a.url,
        size: a.size,
      })),
      skillId: skillId,
    };
    addMessage(sessionId, userMsg);

    const sessionMessages = getSessionMessages(sessionId) || [];
    const apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }> = [];

    const soulSystemMessage = buildSoulSystemMessage();
    if (soulSystemMessage) {
      apiMessages.push({ role: 'system', content: soulSystemMessage });
    }

    if (referencedSessionIds && referencedSessionIds.length > 0) {
      const memoryContext = await extractAndAppendMemory(referencedSessionIds, message);
      if (memoryContext) {
        apiMessages.push({
          role: 'system',
          content: formatMemoryContext(memoryContext),
        });
      }
    }

    if (skillContext) {
      apiMessages.push({
        role: 'system',
        content: skillContext,
      });
    }

    let hasVisionAttachment = false;
    for (const msg of sessionMessages) {
      if (msg.role === 'user') {
        let content: MessageContent = msg.content;
        if (msg.attachments && msg.attachments.length > 0 && hasVision) {
          hasVisionAttachment = true;
          const parts: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
            { type: 'text', text: msg.content },
          ];
          for (const att of msg.attachments) {
            if (att.type === 'image' && att.url) {
              parts.push({
                type: 'image_url',
                image_url: { url: att.url },
              });
            }
          }
          content = parts as unknown as MessageContent;
        }
        apiMessages.push({ role: 'user', content });
      } else if (msg.role === 'assistant') {
        apiMessages.push({ role: 'assistant', content: msg.content });
      }
    }

    const sanitizedMessages = sanitizeToolMessages(
      apiMessages as Array<{ role: string; content: MessageContent | null; tool_calls?: unknown[]; tool_call_id?: string }>,
      hasVisionAttachment,
    );

    const apiKeyResult = selectKey(modelConfig, hasVisionAttachment);
    if (!apiKeyResult) {
      throw new Error('没有可用的 API Key');
    }

    const modelCallConfig = {
      ...modelConfig,
      apiKey: apiKeyResult.key,
      baseURL: apiKeyResult.baseUrl || modelConfig.baseURL,
    };

    const sessionKey = sessionId;

    const { runId, abort: abortRun } = startAgentRun({
      sessionId,
      sessionKey,
      message,
      model: modelId,
      modelName,
      modelConfig: modelCallConfig,
      apiMessages: sanitizedMessages as Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }>,
      executionMode,
      attachments: attachments?.map((a) => ({
        type: a.type,
        url: a.url,
        name: a.name,
      })),
      skillContext,
      skillId,
      agentId,
      userId,
      metadata: {
        keyIndex: apiKeyResult.index,
        autoReason: modelResult.reason,
        autoReasonType: modelResult.reasonType,
      },
    });

    const unsubscribe = bridgeAgentEventsToSSE(runId, res);

    req.on('close', () => {
      unsubscribe();
      abortRun();
    });

    const runHandle = startAgentRun({
      sessionId,
      sessionKey,
      message,
      model: modelId,
      modelName,
      modelConfig: modelCallConfig,
      apiMessages: sanitizedMessages as Array<{ role: string; content: MessageContent; tool_calls?: unknown[]; tool_call_id?: string }>,
      executionMode,
      attachments: attachments?.map((a) => ({
        type: a.type,
        url: a.url,
        name: a.name,
      })),
      skillContext,
      skillId,
      agentId,
      userId,
    });

    runHandle.waitForCompletion()
      .then((result) => {
        reportKeyResult(apiKeyResult.index, true);

        const assistantMsg = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: result.content,
          model: modelId,
          timestamp: Date.now(),
          thinkingContent: result.thinkingContent,
          thinkingDuration: result.thinkingDuration,
          toolCalls: result.toolCalls,
          usage: result.usage,
        };
        addMessage(sessionId, assistantMsg);

        unsubscribe();
        if (!res.writableEnded) {
          try { res.end(); } catch { /* ignore */ }
        }
      })
      .catch((error) => {
        reportKeyResult(apiKeyResult.index, false);
        logger.error('[AgentChat] 执行失败:', error);

        unsubscribe();
        if (!res.writableEnded) {
          try {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              code: error.code || 'EXECUTION_ERROR',
              message: error.message || '执行失败',
            })}\n\n`);
            res.end();
          } catch { /* ignore */ }
        }
      });

  } catch (error) {
    logger.error('[AgentChat] 处理请求失败:', error);

    if (!res.writableEnded) {
      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          code: (error as any).code || 'SERVER_ERROR',
          message: (error as Error).message || '服务器内部错误',
        })}\n\n`);
        res.end();
      } catch { /* ignore */ }
    }
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
    activeCount: getActiveRunCount(),
  });
});

router.post('/agent-run/abort/:runId', (req, res) => {
  const { runId } = req.params;
  const success = abortAgentRun(runId);
  res.json({ ok: true, runId, aborted: success });
});

router.get('/agent/active-count', (_req, res) => {
  res.json({
    activeRuns: getActiveRunCount(),
  });
});

export default router;
