/**
 * OpenAI Chat Completions API 适配器
 *
 * 支持 OpenAI Chat Completions API 格式，包括：
 * - 流式 SSE 响应
 * - Tool Calling
 * - Reasoning / Thinking（多种字段格式兼容）
 * - Vision (图片输入)
 * - 多种 Provider 兼容
 */

import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { logger } from '../logger.js';

/**
 * 判断思考级别是否有效（非 off）
 */
function isThinkingEnabled(level?: string | null): boolean {
  if (!level) return false;
  const normalized = level.toLowerCase().trim();
  return normalized !== 'off' && normalized !== 'disable' && normalized !== '0' && normalized !== 'false';
}

/**
 * 规范化思考级别为 reasoning_effort 值
 */
const THINKING_LEVEL_TO_EFFORT: Record<string, string> = {
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  adaptive: 'medium',
  high: 'high',
  xhigh: 'high',
  max: 'high',
};

function normalizeThinkingEffort(level?: string | null): string | null {
  if (!isThinkingEnabled(level)) return null;
  const normalized = level!.toLowerCase().trim();
  return THINKING_LEVEL_TO_EFFORT[normalized] || 'medium';
}

/**
 * 应用角色映射
 */
function applyRoleMapping(
  messages: Array<{ role: string; content: MessageContent }>,
  roleMap?: Record<string, string>,
): Array<{ role: string; content: MessageContent }> {
  if (!roleMap) return messages;
  return messages.map(msg => ({
    ...msg,
    role: roleMap[msg.role] || msg.role,
  }));
}

/**
 * 处理 system 消息回退（不支持 system 消息时合并到首条 user 消息）
 */
function handleSystemMessageFallback(
  messages: Array<{ role: string; content: MessageContent }>,
  fallback?: 'merge-to-first-user' | 'ignore',
): Array<{ role: string; content: MessageContent }> {
  if (!fallback) return messages;

  const systemMsgs = messages.filter(m => m.role === 'system');
  if (systemMsgs.length === 0) return messages;

  if (fallback === 'ignore') {
    return messages.filter(m => m.role !== 'system');
  }

  // merge-to-first-user: 合并所有 system 消息到首条 user 消息
  const systemContent = systemMsgs
    .map(m => typeof m.content === 'string' ? m.content : m.content.map(c => 'text' in c ? c.text : '').join('\n'))
    .join('\n\n');

  const otherMsgs = messages.filter(m => m.role !== 'system');
  const firstUserIdx = otherMsgs.findIndex(m => m.role === 'user');

  if (firstUserIdx === -1) {
    // 没有 user 消息，插入一条
    otherMsgs.unshift({ role: 'user', content: systemContent });
  } else {
    const firstUser = otherMsgs[firstUserIdx];
    if (typeof firstUser.content === 'string') {
      otherMsgs[firstUserIdx] = {
        ...firstUser,
        content: systemContent + '\n\n' + firstUser.content,
      };
    } else {
      // 数组形式，找到第一个 text 部分插入
      const newContent = [...firstUser.content];
      const firstTextIdx = newContent.findIndex(c => c.type === 'text');
      if (firstTextIdx !== -1) {
        newContent[firstTextIdx] = {
          ...newContent[firstTextIdx],
          text: systemContent + '\n\n' + (newContent[firstTextIdx] as any).text,
        };
      } else {
        newContent.unshift({ type: 'text', text: systemContent });
      }
      otherMsgs[firstUserIdx] = { ...firstUser, content: newContent };
    }
  }

  return otherMsgs;
}

export class OpenAIChatAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'openai-chat';

  async callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const {
      apiEndpoint,
      apiKey,
      modelId,
      authMode = 'api-key',
      temperature = 0.7,
      topP,
      maxTokens = 1024,
      capabilities,
      thinkingLevel,
      signal,
      compat,
    } = config;

    const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

    // 角色映射
    let processedMessages = applyRoleMapping(messages, compat?.roleMap);

    // System 消息回退
    if (compat?.supportsSystemMessage === false && compat?.systemMessageFallback) {
      processedMessages = handleSystemMessageFallback(processedMessages, compat.systemMessageFallback);
    }

    // 媒体输入校验
    const maxImages = compat?.maxImages;
    const maxFileSize = config.mediaInput?.image?.maxFileSize;
    if (maxImages !== undefined || maxFileSize !== undefined) {
      let imageCount = 0;
      for (const msg of processedMessages) {
        if (Array.isArray(msg.content)) {
          imageCount += msg.content.filter(c => c.type === 'image_url').length;
        }
      }

      // 截断超出的图片
      if (maxImages !== undefined && imageCount > maxImages) {
        const toRemove = imageCount - maxImages;
        let removed = 0;
        for (let i = processedMessages.length - 1; i >= 0 && removed < toRemove; i--) {
          const msg = processedMessages[i];
          if (Array.isArray(msg.content)) {
            const newContent: typeof msg.content = [];
            for (let j = msg.content.length - 1; j >= 0; j--) {
              if (msg.content[j].type === 'image_url' && removed < toRemove) {
                removed++;
                continue;
              }
              newContent.unshift(msg.content[j]);
            }
            processedMessages[i] = { ...msg, content: newContent };
          }
        }
        logger.debug(`[OpenAIChatAdapter] 图片数量 ${imageCount} 超过限制 ${maxImages}，已截断 ${toRemove} 张`);
      }

      // 检查 base64 图片大小
      if (maxFileSize !== undefined) {
        for (const msg of processedMessages) {
          if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
              if (part.type === 'image_url' && part.image_url?.url) {
                const url = part.image_url.url;
                if (url.startsWith('data:')) {
                  const match = url.match(/^data:([^;]+);base64,(.+)$/);
                  if (match) {
                    const base64Data = match[2];
                    const estimatedSize = Math.floor((base64Data.length * 3) / 4);
                    if (estimatedSize > maxFileSize) {
                      logger.warn(`[OpenAIChatAdapter] 图片大小 ${estimatedSize} 字节超过限制 ${maxFileSize} 字节`);
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    let endpoint = apiEndpoint.replace(/\/+$/, '');
    if (!endpoint.endsWith('/chat/completions')) {
      endpoint += '/chat/completions';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && apiKey.trim()) {
      const mode = authMode || 'api-key';
      if (mode === 'api-key' || mode === 'token' || mode === 'oauth') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    // API 版本（如 Azure OpenAI）
    if (compat?.apiVersion) {
      headers['api-version'] = compat.apiVersion;
    }

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    const body: Record<string, unknown> = {
      model: modelId,
      messages: processedMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    if (topP !== undefined) {
      body.top_p = topP;
    }

    // 思考级别控制
    const supportsReasoning = compat?.supportsReasoning ?? capabilities?.includes('reasoning');
    const reasoningEffort = normalizeThinkingEffort(thinkingLevel);
    if (supportsReasoning && reasoningEffort) {
      const thinkingParamField = compat?.thinking?.paramField || 'reasoning_effort';
      const levelMap = compat?.thinking?.levelMap;
      const effort = levelMap?.[reasoningEffort] || reasoningEffort;
      body[thinkingParamField] = effort;
    }

    // Tool Calling
    const supportsToolCalls = compat?.supportsToolCalls ?? true;
    if (tools && tools.length > 0 && supportsToolCalls) {
      // 本地模型不发送 tools（优化首响应速度）
      const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.:11434/.test(apiEndpoint);
      if (isLocal) {
        logger.debug(`[OpenAIChatAdapter] 本地模型跳过 tools 参数 (model=${modelId}, tools=${tools.length})`);
      } else {
        body.tools = tools;
      }
      body.tool_choice = config.toolChoice ?? 'auto';
    }

    // Prompt Cache: OpenAI 自动缓存前缀，但可以设置 cache key 用于分组
    if (compat?.supportsPromptCache) {
      body.prompt_cache_key = `session_${Date.now().toString(36)}`;
    }

    // 自定义 body 参数
    if (compat?.extraBodyParams) {
      Object.assign(body, compat.extraBodyParams);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });
    } catch (fetchErr) {
      const errMsg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect')) {
        throw new AIAPIError(
          `无法连接到 AI 模型服务，请确认服务已启动。错误：${errMsg}`,
          'network',
        );
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 400) {
        const toolMsgs = processedMessages.filter((m: any) => m.role === 'tool');
        const assistantWithCalls = processedMessages.filter((m: any) => m.role === 'assistant' && m.tool_calls);
        logger.error(`[OpenAIChatAdapter] 400 错误诊断: ${toolMsgs.length} 条 tool 消息, ${assistantWithCalls.length} 条 assistant(tool_calls)`);
      }
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
        category,
        response.status,
        errorText,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new AIAPIError('无法获取响应流', 'server');

    const decoder = new TextDecoder();
    let fullContent = '';
    let reasoningContent = '';
    let buffer = '';

    const toolCalls: ToolCall[] = [];
    let currentToolCallIndex = -1;
    let currentToolName = '';
    let usageData: AIResponse['usage'];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          if (!trimmed.startsWith('data: ')) {
            try {
              const parsed = JSON.parse(trimmed);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                fullContent += delta;
                onChunk(delta);
              }
            } catch {
              // 非 JSON 行，忽略
            }
            continue;
          }

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;

            // 多路径 reasoning content 解析
            const reasoningDelta =
              delta?.reasoning_content ??
              delta?.reasoning ??
              parsed.reasoning_content ??
              parsed.choices?.[0]?.reasoning_content ??
              (parsed.choices?.[0] as any)?.delta?.reasoning_content ??
              delta?.thinking ??
              (parsed as any).reasoning ??
              null;

            if (reasoningDelta !== null && reasoningDelta !== undefined && typeof reasoningDelta === 'string') {
              reasoningContent += reasoningDelta;
              if (onThinking) onThinking(reasoningDelta);
            }

            // 文本内容
            const text = delta?.content;
            if (text && typeof text === 'string') {
              fullContent += text;
              onChunk(text);
            }

            // Tool Calling 检测
            if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (tc.function?.name) {
                currentToolName = tc.function.name;
              }
              if (idx !== currentToolCallIndex) {
                // 新的 tool call
                currentToolCallIndex = idx;
                const newToolCall: ToolCall = {
                  id: tc.id || '',
                  type: 'function',
                  function: {
                    name: currentToolName || tc.function?.name || '',
                    arguments: tc.function?.arguments || '',
                  },
                };
                toolCalls.push(newToolCall);
                if (onToolCall) {
                  onToolCall(newToolCall);
                }
              } else if (toolCalls.length > 0) {
                // 追加到当前 tool call 的 arguments
                const lastCall = toolCalls[toolCalls.length - 1];
                if (tc.function?.arguments) {
                  lastCall.function.arguments += tc.function.arguments;
                }
                if (tc.function?.name) {
                  lastCall.function.name = tc.function.name;
                }
              }
            }
            }

            // Usage
            if (parsed.usage) {
              usageData = {
                promptTokens: parsed.usage.prompt_tokens,
                completionTokens: parsed.usage.completion_tokens,
                totalTokens: parsed.usage.total_tokens,
              };
              if (onUsage && usageData) {
                onUsage(usageData);
              }
            }
          } catch {
            // 解析失败，忽略
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      reasoningContent: reasoningContent || undefined,
      usage: usageData,
    };
  }

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    let fullContent = '';
    let reasoningContent = '';
    const toolCalls: ToolCall[] = [];

    const result = await this.callStream(
      config,
      messages,
      {
        onChunk: (text) => { fullContent += text; },
        onThinking: (text) => { reasoningContent += text; },
        onToolCall: (tc) => { toolCalls.push(tc); },
      },
      tools,
    );

    return result;
  }
}

export const openAIChatAdapterFactory = () => new OpenAIChatAdapter();
