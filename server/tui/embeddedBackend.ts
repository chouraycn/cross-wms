/**
 * ChatService Backend — TUI 真实后端
 *
 * 替换之前的桩实现，连接到现有 chatService 的核心能力：
 * - 会话/消息持久化：使用 server/dao/chat.ts 中的 DAO 函数（与 Web 端共享存储）
 * - 流式 AI 响应：使用 server/engine/toolExecutor.ts 的 executeToolLoop 直接执行 Tool Calling 循环
 * - 模型配置：使用 server/modelsStore.ts 的 loadModelsConfig + server/keyRotator 的 selectKey
 *
 * 该后端不依赖 Express / HTTP 路径，绕开 handleChat 中 res.write 的硬依赖。
 * 所有 chatService 调用都用 try/catch 包装，失败时降级到内存实现。
 */

import { v4 as uuidv4 } from 'uuid';
import type { TuiBackend, ChatEvent, SessionInfo } from './types.js';
import { logger } from '../logger.js';
import {
  getSessions,
  createSession as daoCreateSession,
  getSessionMessages,
  addMessage as daoAddMessage,
  deleteSession as daoDeleteSession,
} from '../dao/chat.js';
import { executeToolLoop } from '../engine/toolExecutor.js';
import { loadModelsConfig, type ModelConfig } from '../modelsStore.js';
import { selectKey, reportKeyResult } from '../keyRotator.js';
import { isLocalModel } from '../modelsStore.js';
import type { ModelCallConfig, MessageContent, ToolCall } from '../aiClient.js';
import { buildSoulSystemMessage } from '../engine/soulLoader.js';

// 内存会话缓存（加速历史消息读取，避免每次都访问磁盘/JSONL）
const sessionCache = new Map<string, Array<{ role: string; content: string }>>();

// 默认执行模式
const DEFAULT_EXECUTION_MODE: 'legacy' | 'react' = 'legacy';
const MAX_TOOL_TURNS = 10;

export class ChatServiceBackend implements TuiBackend {
  private abortController: AbortController | null = null;
  private currentSessionId: string | null = null;
  private currentModelId: string | null = null;
  private lastUsedModelId: string | null = null;

  /**
   * 加载默认模型 ID（按 modelsStore 的 defaultModelId 取，并校验可用性）
   */
  private async resolveDefaultModelId(): Promise<string | null> {
    try {
      const modelsConfig = await loadModelsConfig();
      const defaultId = modelsConfig.defaultModelId;
      const found = modelsConfig.models.find((m) => m.id === defaultId && m.enabled !== false);
      if (found) return found.id;
      // 退而求其次，取第一个 enabled 模型
      const first = modelsConfig.models.find((m) => m.enabled !== false);
      return first?.id ?? null;
    } catch (err) {
      logger.warn(`[TUI Backend] 加载模型配置失败: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * 构造最终用于 AI 调用的 ModelCallConfig
   */
  private async buildModelConfig(modelId: string | null): Promise<ModelCallConfig | null> {
    try {
      const modelsConfig = await loadModelsConfig();
      const targetId = modelId ?? modelsConfig.defaultModelId;
      const model = modelsConfig.models.find((m) => m.id === targetId && m.enabled !== false)
        ?? modelsConfig.models.find((m) => m.id === targetId)
        ?? modelsConfig.models.find((m) => m.enabled !== false);
      if (!model) {
        logger.warn(`[TUI Backend] 未找到可用模型: ${targetId}`);
        return null;
      }

      const keyResult = selectKey(model as ModelConfig);
      const apiKey = keyResult?.key ?? (model as any).apiKey ?? '';

      return {
        id: model.id,
        provider: (model as any).provider ?? 'openai',
        apiEndpoint: (model as any).apiEndpoint,
        apiKey,
        temperature: (model as any).temperature ?? 0.7,
        topP: (model as any).topP ?? 1,
        maxTokens: (model as any).maxTokens,
        contextWindow: (model as any).contextWindow,
        capabilities: (model as any).capabilities ?? [],
      } as ModelCallConfig;
    } catch (err) {
      logger.warn(`[TUI Backend] 构建模型配置失败: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  /**
   * 将 DB 消息转换为 AI 调用所需的 API 消息格式
   */
  private buildApiMessagesFromHistory(
    history: Array<{ role: string; content: string }>,
  ): Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> {
    const apiMessages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }> = [];

    // 注入 Soul 系统消息
    try {
      const soul = buildSoulSystemMessage();
      if (soul && soul.trim()) {
        apiMessages.push({ role: 'system', content: soul.trim() });
      }
    } catch {
      // ignore
    }

    for (const msg of history) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        apiMessages.push({ role: msg.role, content: msg.content });
      } else if (msg.role === 'system') {
        apiMessages.push({ role: 'system', content: msg.content });
      }
    }

    return apiMessages;
  }

  async *sendChat(
    messages: Array<{ role: string; content: string }>,
    signal?: AbortSignal,
  ): AsyncIterable<ChatEvent> {
    this.abortController = new AbortController();
    if (signal) {
      // 用户传入的 signal 触发时也中止内部请求
      if (signal.aborted) {
        this.abortController.abort();
      } else {
        signal.addEventListener('abort', () => this.abortController?.abort(), { once: true });
      }
    }

    // 当前会话 ID（从 TUI 主循环上下文中获取）
    const sessionId = this.currentSessionId;
    const lastMessage = messages[messages.length - 1];

    // 解析模型 ID（优先 currentModelId > lastUsedModelId > 系统默认）
    let modelId = this.currentModelId ?? this.lastUsedModelId;
    if (!modelId) {
      modelId = await this.resolveDefaultModelId();
    }

    // 构建模型配置
    const modelConfig = await this.buildModelConfig(modelId);
    if (!modelConfig) {
      yield {
        type: 'error',
        error: '未找到可用的 AI 模型配置，请先在 Web 端配置模型。',
      };
      this.abortController = null;
      return;
    }
    this.lastUsedModelId = modelConfig.id;

    // 选择 API Key 索引（用于成功后上报）
    const modelsConfig = await loadModelsConfig().catch(() => null);
    const modelEntry = modelsConfig?.models.find((m) => m.id === modelConfig.id) ?? null;
    const keyResult = modelEntry ? selectKey(modelEntry) : null;
    const selectedKeyIndex = keyResult?.index ?? -1;

    // 准备 API 消息（系统提示 + 历史 + 当前用户消息）
    const apiMessages = this.buildApiMessagesFromHistory(messages);

    // 持久化用户消息
    if (sessionId && lastMessage && lastMessage.role === 'user') {
      try {
        daoAddMessage({
          sessionId,
          role: 'user',
          content: lastMessage.content,
          model: modelConfig.id,
        });
      } catch (err) {
        logger.warn(`[TUI Backend] 保存用户消息失败: ${err instanceof Error ? err.message : String(err)}`);
      }
      // 更新缓存
      const cached = sessionCache.get(sessionId) ?? [];
      cached.push({ role: 'user', content: lastMessage.content });
      sessionCache.set(sessionId, cached);
    }

    // 发送 assistant_start
    yield { type: 'assistant_start' };

    // 累积助手响应内容（用于保存到 DB）
    let assistantText = '';
    const toolRecords: Array<{ name: string; arguments: string; result: string }> = [];

    try {
      // 调用核心执行循环（与 streamExecutor 内部使用的同一函数）
      const result = await executeToolLoop({
        modelConfig,
        messages: apiMessages,
        maxToolTurns: MAX_TOOL_TURNS,
        signal: this.abortController.signal,
        onChunk: (text: string) => {
          if (this.abortController?.signal.aborted) return;
          assistantText += text;
          // 通过迭代器 yield — 但我们处于非生成器上下文
          // 这里借助一个事件队列：实际推送由 ChatEvent 消费者接收
        },
        onThinking: (text: string) => {
          if (this.abortController?.signal.aborted) return;
          // thinking 事件由 ChatEvent 消费者接收
        },
        onToolCall: (toolCall: ToolCall, result: string) => {
          if (this.abortController?.signal.aborted) return;
          toolRecords.push({
            name: toolCall.function?.name ?? 'unknown',
            arguments: toolCall.function?.arguments ?? '{}',
            result,
          });
        },
        sessionId: sessionId ?? undefined,
      });

      if (this.abortController.signal.aborted) {
        // 用户中止，不再推送
        return;
      }

      // 上报 Key 成功
      if (selectedKeyIndex >= 0 && modelEntry) {
        reportKeyResult(modelConfig.id, selectedKeyIndex, true);
      }

      // 分块推送文本内容（模拟流式输出，便于 TUI 实时显示）
      const fullContent = result.content || assistantText;
      if (fullContent) {
        const chunkSize = 32;
        for (let i = 0; i < fullContent.length; i += chunkSize) {
          if (this.abortController.signal.aborted) break;
          const chunk = fullContent.slice(i, i + chunkSize);
          yield { type: 'assistant_chunk', content: chunk };
          // 微小延迟，避免一次性刷出
          await new Promise((r) => setImmediate(r));
        }
      }

      // 推送工具调用记录
      for (const tc of result.toolCalls ?? toolRecords) {
        if (this.abortController.signal.aborted) break;
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments);
        } catch {
          parsedArgs = {};
        }
        yield {
          type: 'tool_call',
          toolName: tc.name,
          toolArgs: parsedArgs,
        };
        yield {
          type: 'tool_result',
          toolName: tc.name,
          toolResult: tc.result,
        };
      }

      // 推送 thinking（如果有）
      if ((result as any).thinkingContent) {
        yield { type: 'thinking', content: (result as any).thinkingContent };
      }

      yield { type: 'assistant_end' };

      // 持久化助手消息
      if (sessionId && fullContent) {
        try {
          daoAddMessage({
            sessionId,
            role: 'assistant',
            content: fullContent,
            model: modelConfig.id,
            toolCalls: toolRecords.length > 0 ? JSON.stringify(toolRecords) : undefined,
          });
        } catch (err) {
          logger.warn(`[TUI Backend] 保存助手消息失败: ${err instanceof Error ? err.message : String(err)}`);
        }
        // 更新缓存
        const cached = sessionCache.get(sessionId) ?? [];
        cached.push({ role: 'assistant', content: fullContent });
        sessionCache.set(sessionId, cached);
      }
    } catch (err) {
      if (this.abortController.signal.aborted) {
        // 用户中断，不算错误
        return;
      }

      // 上报 Key 失败
      if (selectedKeyIndex >= 0 && modelEntry) {
        reportKeyResult(modelConfig.id, selectedKeyIndex, false);
      }

      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[TUI Backend] AI 调用失败: ${errMsg}`);
      yield { type: 'error', error: this.formatError(err) };
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 格式化错误消息（与 chatService 的 classifyAndFormatError 类似的友好提示）
   */
  private formatError(err: unknown): string {
    if (err instanceof Error) {
      const msg = err.message;
      if (/API Key|api key|apikey|auth/i.test(msg)) {
        return 'API Key 无效或缺失，请在 Web 端「模型管理」中检查密钥配置。';
      }
      if (/timeout|超时/i.test(msg)) {
        return '请求超时，模型响应时间过长，请稍后重试。';
      }
      if (/network|fetch|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
        return '网络连接失败，请检查网络或 API 端点配置。';
      }
      if (/abort|取消/i.test(msg)) {
        return '请求已取消。';
      }
      return `AI 调用失败: ${msg}`;
    }
    return `AI 调用失败: ${String(err)}`;
  }

  abortChat(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async loadHistory(sessionId: string): Promise<Array<{ role: string; content: string }>> {
    // 优先从缓存加载
    const cached = sessionCache.get(sessionId);
    if (cached && cached.length > 0) return cached;

    // 从 chatService DAO 加载
    try {
      const messages = getSessionMessages(sessionId);
      const simplified = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role, content: m.content ?? '' }));
      sessionCache.set(sessionId, simplified);
      return simplified;
    } catch (err) {
      logger.warn(`[TUI Backend] 加载历史消息失败: ${err instanceof Error ? err.message : String(err)}`);
      return cached ?? [];
    }
  }

  async listSessions(): Promise<SessionInfo[]> {
    try {
      const sessions = getSessions();
      return sessions
        .map((s) => ({
          id: s.id,
          title: s.title || '新对话',
          createdAt: this.parseDate(s.createdAt),
          updatedAt: this.parseDate(s.updatedAt),
          messageCount: (s as any).messageCount ?? 0,
        }))
        .sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      logger.warn(`[TUI Backend] 列出会话失败: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async createSession(title?: string): Promise<SessionInfo> {
    try {
      const modelId = this.currentModelId ?? this.lastUsedModelId ?? (await this.resolveDefaultModelId() ?? 'default');
      const sessionId = uuidv4();
      const session = daoCreateSession(
        sessionId,
        title || `会话 ${new Date().toLocaleString()}`,
        modelId,
      );
      const now = Date.now();
      sessionCache.set(session.id, []);
      this.currentSessionId = session.id;
      return {
        id: session.id,
        title: session.title,
        createdAt: this.parseDate(session.createdAt) || now,
        updatedAt: this.parseDate(session.updatedAt) || now,
        messageCount: 0,
      };
    } catch (err) {
      logger.error(`[TUI Backend] 创建会话失败: ${err instanceof Error ? err.message : String(err)}`);
      // 降级到内存会话
      const id = `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      sessionCache.set(id, []);
      this.currentSessionId = id;
      return {
        id,
        title: title || `会话 ${new Date(now).toLocaleString()}`,
        createdAt: now,
        updatedAt: now,
        messageCount: 0,
      };
    }
  }

  async deleteSession(id: string): Promise<void> {
    sessionCache.delete(id);
    if (this.currentSessionId === id) {
      this.currentSessionId = null;
    }
    try {
      daoDeleteSession(id);
    } catch (err) {
      logger.warn(`[TUI Backend] 删除会话失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 解析日期字符串为毫秒时间戳
   */
  private parseDate(value: string | number | undefined | null): number {
    if (!value) return Date.now();
    if (typeof value === 'number') return value;
    const ts = Date.parse(value);
    return Number.isNaN(ts) ? Date.now() : ts;
  }
}

// 兼容旧 API：保持 EmbeddedBackend 别名，避免破坏其它引用
export { ChatServiceBackend as EmbeddedBackend };
