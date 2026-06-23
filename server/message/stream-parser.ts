/**
 * CDFKnow 四层对话架构 — 流式消息解析器
 *
 * LLM 返回 delta 分片，实时组装 Envelope，
 * 通过 SSE 推送到前端。
 */

import type {
  MessageEnvelope,
  MessageMeta,
  ToolBlock,
  SSEEvent,
} from './envelope';
import {
  createAssistantEnvelope,
  createToolBlock,
} from './envelope';

// ===================== 类型定义 =====================

/** 流式 chunk 类型 */
export interface StreamChunk {
  type: 'content' | 'thinking' | 'toolCall' | 'done' | 'error' | 'meta';
  data: unknown;
}

/** 流式解析器状态 */
export interface StreamParserState {
  buffer: string;
  envelope: MessageEnvelope;
  done: boolean;
  error?: string;
}

// ===================== 导出函数 =====================

/**
 * 创建流式解析器
 *
 * 初始化一个空的 assistant envelope，准备接收流式 chunk。
 */
export function createStreamParser(sessionId: string, model: string): StreamParserState {
  return {
    buffer: '',
    envelope: createAssistantEnvelope(sessionId, model),
    done: false,
  };
}

/**
 * 处理流式 chunk
 *
 * 根据 chunk 类型更新解析器状态，返回需要发送的 SSE 事件数组。
 * 一个 chunk 可能产生 0 个或多个 SSE 事件。
 */
export function processStreamChunk(
  state: StreamParserState,
  chunk: StreamChunk,
): SSEEvent[] {
  const events: SSEEvent[] = [];

  switch (chunk.type) {
    case 'content': {
      // 文本内容 delta
      const text = String(chunk.data ?? '');
      state.buffer += text;
      state.envelope.content = state.buffer;
      events.push({
        type: 'message-stream',
        payload: { ...state.envelope },
      });
      break;
    }

    case 'thinking': {
      // 深度思考内容 delta
      const thinkingText = String(chunk.data ?? '');
      state.envelope.thinking = (state.envelope.thinking ?? '') + thinkingText;
      events.push({
        type: 'message-thinking',
        payload: { ...state.envelope },
      });
      break;
    }

    case 'toolCall': {
      // 工具调用通知
      const toolData = chunk.data as {
        id?: string;
        type?: 'skill' | 'mcp';
        name?: string;
        input?: Record<string, unknown>;
        result?: string;
        error?: string;
        status?: 'pending' | 'running' | 'done' | 'error';
      };

      if (!state.envelope.toolBlocks) {
        state.envelope.toolBlocks = [];
      }

      // 查找已有的工具块（通过 id 或 name 匹配）
      let block: ToolBlock | undefined;
      if (toolData.id) {
        block = state.envelope.toolBlocks.find((b) => b.id === toolData.id);
      }
      if (!block && toolData.name) {
        block = state.envelope.toolBlocks.find((b) => b.name === toolData.name);
      }

      if (block) {
        // 更新已有工具块
        if (toolData.status) block.status = toolData.status;
        if (toolData.result !== undefined) block.result = toolData.result;
        if (toolData.error !== undefined) block.error = toolData.error;
        if (toolData.status === 'done' || toolData.status === 'error') {
          block.completedAt = Date.now();
        }
      } else {
        // 创建新工具块
        block = createToolBlock(
          toolData.type ?? 'skill',
          toolData.name ?? 'unknown',
          toolData.input ?? {},
        );
        if (toolData.id) block.id = toolData.id;
        if (toolData.status) block.status = toolData.status;
        state.envelope.toolBlocks.push(block);
      }

      events.push({
        type: 'message-tool',
        payload: { ...state.envelope },
      });
      break;
    }

    case 'meta': {
      // 元数据更新（token 计数、耗时等）
      const meta = chunk.data as Partial<MessageMeta>;
      if (state.envelope.meta) {
        Object.assign(state.envelope.meta, meta);
      }
      break;
    }

    case 'error': {
      // 错误处理
      state.done = true;
      state.error = String(chunk.data ?? 'Unknown error');
      state.envelope.isStreaming = false;
      events.push({
        type: 'message-error',
        payload: { ...state.envelope },
      });
      break;
    }

    case 'done': {
      // 流结束
      state.done = true;
      state.envelope.isStreaming = false;
      state.envelope.thinkingDone = true;
      // done 事件由 finalizeStream 生成，此处不重复发送
      break;
    }
  }

  return events;
}

/**
 * 完成流式解析
 *
 * 标记流结束，返回最终的 message-done SSE 事件。
 */
export function finalizeStream(state: StreamParserState): SSEEvent {
  state.done = true;
  state.envelope.isStreaming = false;
  state.envelope.thinkingDone = true;

  return {
    type: 'message-done',
    payload: { ...state.envelope },
  };
}
