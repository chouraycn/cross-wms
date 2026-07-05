/**
 * ChatServiceRuntime — ACP runtime 实现，桥接 chatService
 *
 * 这是 ACP 引擎与 cross-wms 聊天能力的连接器：
 * - 实现 AcpRuntime 接口（createSession / close / executeTurn）
 * - executeTurn 内部调用 runChatSession 执行实际对话
 * - 将 SSE 事件流转换为 AcpTurnEvent 异步迭代器
 *
 * 架构定位：
 *   ACP SessionManager → ChatServiceRuntime → runChatSession → chatService.handleChat
 *
 * 注册方式：
 *   getRuntimeRegistry().registerBackend(chatServiceBackend)
 */

import { randomUUID } from 'crypto';
import type {
  AcpRuntime,
  AcpRuntimeHandle,
  AcpRuntimeSessionOptions,
  AcpRuntimeCapabilities,
  AcpTurnEvent,
  SessionAcpMeta,
} from './types.js';
import type { RuntimeBackend } from './runtimeRegistry.js';
import { runChatSession } from '../runChatSession.js';
import { logger } from '../../logger.js';

// ===================== Runtime 实现 =====================

export class ChatServiceRuntime implements AcpRuntime {
  readonly name = 'chat-service';
  readonly version = '1.0.0';

  readonly capabilities: AcpRuntimeCapabilities = {
    supportsStreaming: true,
    supportsToolCalls: true,
    supportsAttachments: true,
    supportsMultipleModes: true,
  };

  async createSession(options: AcpRuntimeSessionOptions): Promise<AcpRuntimeHandle> {
    const handle: AcpRuntimeHandle = {
      id: randomUUID(),
      sessionId: options.model ? `sess_${options.model}` : `sess_${randomUUID().slice(0, 8)}`,
      runtimeName: this.name,
      status: 'active',
    };
    logger.debug(`[ChatServiceRuntime] createSession: ${handle.id}`);
    return handle;
  }

  async close(params: { handle: AcpRuntimeHandle; reason: string }): Promise<void> {
    logger.debug(`[ChatServiceRuntime] close: ${params.handle.id} (${params.reason})`);
  }

  async executeTurn(params: {
    handle: AcpRuntimeHandle;
    text: string;
    attachments?: unknown[];
    mode: string;
    signal: AbortSignal;
    requestId: string;
  }): Promise<{ stream?: AsyncIterable<AcpTurnEvent> }> {
    const { handle, text, attachments, signal } = params;

    // 创建异步事件流
    const stream = this.createEventStream(handle, text, attachments, signal);
    return { stream };
  }

  /**
   * 将 runChatSession 的 SSE 事件流转换为 AcpTurnEvent 异步迭代器
   */
  private async *createEventStream(
    handle: AcpRuntimeHandle,
    text: string,
    attachments?: unknown[],
    signal?: AbortSignal,
  ): AsyncIterable<AcpTurnEvent> {
    const queue: AcpTurnEvent[] = [];
    let resolveWait: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    // 启动 runChatSession
    const runPromise = runChatSession(
      {
        sessionId: handle.sessionId,
        message: text,
        attachments,
      },
      {
        onEvent: (event) => {
          const acpEvents = convertSSEtoAcpEvents(event);
          for (const evt of acpEvents) {
            queue.push(evt);
          }
          if (resolveWait) {
            resolveWait();
            resolveWait = null;
          }
        },
        onDone: (result) => {
          // 确保发出 done 事件
          if (!done) {
            const doneEvent: AcpTurnEvent = {
              type: 'done',
              finishReason: result.errorCode ? 'error' : 'stop',
              usage: result.usage as { promptTokens: number; completionTokens: number; totalTokens: number } | undefined,
            };
            queue.push(doneEvent);
          }
          done = true;
          if (resolveWait) {
            resolveWait();
            resolveWait = null;
          }
        },
        onError: (err) => {
          error = err;
          done = true;
          if (resolveWait) {
            resolveWait();
            resolveWait = null;
          }
        },
      },
    );

    // 监听 abort
    if (signal) {
      signal.addEventListener('abort', () => {
        done = true;
        if (resolveWait) {
          resolveWait();
          resolveWait = null;
        }
      });
    }

    // 消费队列
    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!done) {
        // 等待新事件
        await new Promise<void>((resolve) => {
          resolveWait = resolve;
        });
      }
    }

    // 检查错误
    if (error) {
      yield { type: 'error', error: (error as Error).message, code: 'RUNTIME_ERROR' };
    }

    // 确保 runChatSession 完成
    try {
      await runPromise;
    } catch {
      // 错误已通过 onError 处理
    }
  }
}

// ===================== SSE → AcpTurnEvent 转换 =====================

/**
 * 将单个 SSE 事件转换为 AcpTurnEvent 数组
 */
function convertSSEtoAcpEvents(event: Record<string, unknown>): AcpTurnEvent[] {
  const events: AcpTurnEvent[] = [];
  const type = event.type as string;

  switch (type) {
    case 'text':
      events.push({
        type: 'text_delta',
        text: (event.content as string) || '',
        stream: 'main',
      });
      break;

    case 'thinking':
      events.push({
        type: 'thinking_delta',
        text: (event.content as string) || '',
      });
      break;

    case 'tool_call': {
      const toolCallId = (event.toolCallId as string) || (event.id as string) || '';
      const toolName = (event.toolName as string) || (event.tool as string) || 'unknown';
      const toolArgs = (event.toolArgs as string) || (event.args as string) || '{}';
      const toolResult = event.toolResult ?? event.result;

      // 工具调用
      events.push({
        type: 'tool_call',
        id: toolCallId,
        name: toolName,
        input: toolArgs,
      });

      // 工具结果（如果有）
      if (toolResult !== undefined) {
        events.push({
          type: 'tool_result',
          id: toolCallId,
          result: toolResult,
        });
      }
      break;
    }

    case 'done':
      // done 事件由 onDone 回调处理，这里不重复
      break;

    case 'error':
      events.push({
        type: 'error',
        error: (event.message as string) || '未知错误',
        code: (event.code as string) || 'UNKNOWN_ERROR',
      });
      break;
  }

  return events;
}

// ===================== Backend 注册 =====================

/**
 * 创建 ChatService backend，用于注册到 RuntimeRegistry
 */
export const chatServiceBackend: RuntimeBackend = {
  name: 'default',
  version: '1.0.0',

  async createRuntime(_meta: SessionAcpMeta): Promise<AcpRuntime> {
    return new ChatServiceRuntime();
  },

  getCapabilities(): AcpRuntimeCapabilities {
    return {
      supportsStreaming: true,
      supportsToolCalls: true,
      supportsAttachments: true,
      supportsMultipleModes: true,
    };
  },
};

/**
 * 注册 ChatService runtime backend 到 RuntimeRegistry
 * 应在服务启动时调用
 */
export function registerChatServiceRuntime(): void {
  // 延迟导入避免循环依赖
  import('./runtimeRegistry.js').then(({ getRuntimeRegistry }) => {
    const registry = getRuntimeRegistry();
    if (!registry.hasBackend('default')) {
      registry.registerBackend(chatServiceBackend);
      logger.info('[ACP] ChatService runtime backend 已注册');
    }
  });
}
