/**
 * Anthropic Messages API 适配器
 *
 * 支持 Anthropic 原生 Messages API 格式，包括：
 * - 流式 SSE 响应
 * - Tool Calling (tool_use / tool_result)
 * - Thinking / Extended Thinking
 * - Vision (图片输入)
 */

import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { extractAnthropicThinkingSignature } from '../engine/thinkingSignatureManager.js';
import { logger } from '../logger.js';

/** Anthropic 消息内容块 */
type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string }; cache_control?: { type: 'ephemeral' } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; cache_control?: { type: 'ephemeral' } }
  | { type: 'tool_result'; tool_use_id: string; content: string; cache_control?: { type: 'ephemeral' } };

/** Anthropic 消息 */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/**
 * 将通用消息格式转换为 Anthropic 格式
 */
function convertMessagesToAnthropic(
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  cacheBreakpoints?: ('system' | 'tools' | 'last-user')[],
): { systemPrompt: string | undefined; anthropicMessages: AnthropicMessage[] } {
  let systemPrompt: string | undefined;
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    // System 消息单独提取
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content :
        msg.content.map(c => 'text' in c ? c.text : '').join('\n');
      systemPrompt = systemPrompt ? systemPrompt + '\n' + content : content;
      continue;
    }

    // Tool 消息转换为 user role + tool_result content block
    if (msg.role === 'tool') {
      const content = typeof msg.content === 'string' ? msg.content :
        msg.content.map(c => 'text' in c ? c.text : '').join('\n');
      anthropicMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: msg.tool_call_id || '', content }],
      });
      continue;
    }

    const role = msg.role === 'assistant' ? 'assistant' : 'user';

    // 处理 content
    let content: string | AnthropicContentBlock[];
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else {
      const blocks: AnthropicContentBlock[] = [];
      for (const part of msg.content) {
        if (part.type === 'text') {
          blocks.push({ type: 'text', text: part.text || '' });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          // 解析 base64 图片
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: match[1], data: match[2] },
              });
            }
          } else {
            // URL 图片暂不支持，跳过
            logger.warn('[AnthropicAdapter] URL 图片暂不支持，跳过');
          }
        }
      }
      content = blocks;
    }

    // Assistant 消息的 tool_calls 转换为 tool_use content blocks
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      const blocks: AnthropicContentBlock[] = [];
      if (typeof content === 'string' && content) {
        blocks.push({ type: 'text', text: content });
      } else if (Array.isArray(content)) {
        blocks.push(...content);
      }
      for (const tc of msg.tool_calls) {
        try {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        } catch {
          blocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: {},
          });
        }
      }
      anthropicMessages.push({ role: 'assistant', content: blocks });
    } else {
      anthropicMessages.push({ role, content });
    }
  }

  // 'last-user' 缓存断点：在最后一条 user 消息的内容块上添加 cache_control
  if (cacheBreakpoints?.includes('last-user') && anthropicMessages.length > 0) {
    for (let i = anthropicMessages.length - 1; i >= 0; i--) {
      const msg = anthropicMessages[i];
      if (msg.role !== 'user') continue;
      if (typeof msg.content === 'string') {
        // 字符串内容转换为数组格式，并在 text 块上添加 cache_control
        msg.content = [{ type: 'text', text: msg.content, cache_control: { type: 'ephemeral' } }];
      } else if (Array.isArray(msg.content) && msg.content.length > 0) {
        const lastBlock = msg.content[msg.content.length - 1];
        (lastBlock as AnthropicContentBlock).cache_control = { type: 'ephemeral' };
      }
      break;
    }
  }

  return { systemPrompt, anthropicMessages };
}

/**
 * 将通用 Tool 定义转换为 Anthropic 格式
 */
function convertToolsToAnthropic(
  tools: ToolDefinition[],
  cacheLastTool?: boolean,
): Array<{
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  cache_control?: { type: 'ephemeral' };
}> {
  const result = tools.map(t => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
  if (cacheLastTool && result.length > 0) {
    result[result.length - 1].cache_control = { type: 'ephemeral' };
  }
  return result;
}

/**
 * 判断思考级别是否有效（非 off）
 */
function isThinkingEnabled(level?: string | null): boolean {
  if (!level) return false;
  const normalized = level.toLowerCase().trim();
  return normalized !== 'off' && normalized !== 'disable' && normalized !== '0' && normalized !== 'false';
}

export class AnthropicAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'anthropic-messages';

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
      maxTokens = 1024,
      capabilities,
      thinkingLevel,
      signal,
      compat,
    } = config;

    const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

    // 媒体输入校验（在转换前对原始消息进行校验）
    const maxImages = compat?.maxImages;
    const maxFileSize = config.mediaInput?.image?.maxFileSize;
    let validatedMessages = messages;
    if (maxImages !== undefined || maxFileSize !== undefined) {
      // 创建可变副本
      validatedMessages = messages.map(m => ({ ...m, content: Array.isArray(m.content) ? [...m.content] : m.content }));

      let imageCount = 0;
      for (const msg of validatedMessages) {
        if (Array.isArray(msg.content)) {
          imageCount += msg.content.filter(c => c.type === 'image_url').length;
        }
      }

      // 截断超出的图片
      if (maxImages !== undefined && imageCount > maxImages) {
        const toRemove = imageCount - maxImages;
        let removed = 0;
        for (let i = validatedMessages.length - 1; i >= 0 && removed < toRemove; i--) {
          const msg = validatedMessages[i];
          if (Array.isArray(msg.content)) {
            const newContent: typeof msg.content = [];
            for (let j = msg.content.length - 1; j >= 0; j--) {
              if (msg.content[j].type === 'image_url' && removed < toRemove) {
                removed++;
                continue;
              }
              newContent.unshift(msg.content[j]);
            }
            validatedMessages[i] = { ...msg, content: newContent };
          }
        }
        logger.debug(`[AnthropicAdapter] 图片数量 ${imageCount} 超过限制 ${maxImages}，已截断 ${toRemove} 张`);
      }

      // 检查 base64 图片大小
      if (maxFileSize !== undefined) {
        for (const msg of validatedMessages) {
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
                      logger.warn(`[AnthropicAdapter] 图片大小 ${estimatedSize} 字节超过限制 ${maxFileSize} 字节`);
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
    if (!endpoint.endsWith('/messages')) {
      endpoint += '/messages';
    }

    const { systemPrompt, anthropicMessages } = convertMessagesToAnthropic(
      validatedMessages,
      compat?.cacheBreakpoints,
    );

    const body: Record<string, unknown> = {
      model: modelId,
      messages: anthropicMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    if (systemPrompt && compat?.supportsPromptCache) {
      body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
    } else if (systemPrompt) {
      body.system = systemPrompt; // 保持原有纯字符串格式
    }

    // 思考控制
    const supportsReasoning = compat?.supportsReasoning ?? capabilities?.includes('reasoning');
    if (supportsReasoning && isThinkingEnabled(thinkingLevel)) {
      const level = thinkingLevel!.toLowerCase().trim();
      const budgetRatio = compat?.thinking?.budgetRatio ?? 0.3;
      let thinkingBudget: number;
      if (level.includes('max') || level.includes('xhigh')) {
        thinkingBudget = Math.floor(maxTokens * 0.8);
      } else if (level === 'high') {
        thinkingBudget = Math.floor(maxTokens * 0.6);
      } else if (level === 'medium' || level === 'adaptive') {
        thinkingBudget = Math.floor(maxTokens * 0.4);
      } else if (level === 'minimal') {
        thinkingBudget = Math.floor(maxTokens * 0.15);
      } else {
        thinkingBudget = Math.floor(maxTokens * budgetRatio);
      }
      body.thinking = { type: 'enabled', thinking_budget_tokens: thinkingBudget };
    }

    if (tools && tools.length > 0) {
      body.tools = convertToolsToAnthropic(tools, compat?.cacheBreakpoints?.includes('tools'));
      body.tool_choice = config.toolChoice ?? { type: 'auto' };
    }

    // 自定义 body 参数
    if (compat?.extraBodyParams) {
      Object.assign(body, compat.extraBodyParams);
    }

    const reqHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': compat?.apiVersion || '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    };
    if (apiKey) {
      const mode = authMode || 'api-key';
      if (mode === 'api-key') {
        reqHeaders['x-api-key'] = apiKey;
      } else if (mode === 'bearer' || mode === 'token' || mode === 'oauth') {
        reqHeaders['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(reqHeaders, compat.extraHeaders);
    }

    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: reqHeaders,
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
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Anthropic API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
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
    let currentToolCall: ToolCall | null = null;
    let currentToolInput = '';

    let thinkingSignature: string | undefined;
    let redactedThinking = false;
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
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'content_block_start') {
              const contentBlock = parsed.content_block;
              if (contentBlock?.type === 'thinking' && contentBlock?.thinking) {
                reasoningContent += contentBlock.thinking;
                if (onThinking) onThinking(contentBlock.thinking);
              }
              if (contentBlock?.type === 'thinking' || contentBlock?.type === 'redacted_thinking') {
                const sigInfo = extractAnthropicThinkingSignature(contentBlock);
                if (sigInfo?.signature) {
                  thinkingSignature = sigInfo.signature;
                  redactedThinking = !!sigInfo.redacted;
                }
              }
              if (contentBlock?.type === 'tool_use') {
                currentToolCall = {
                  id: contentBlock.id || '',
                  type: 'function',
                  function: {
                    name: contentBlock.name || '',
                    arguments: '',
                  },
                };
                currentToolInput = '';
              }
            }
            if (parsed.type === 'content_block_delta') {
              if (parsed.delta?.type === 'thinking_delta' && parsed.delta?.thinking) {
                reasoningContent += parsed.delta.thinking;
                if (onThinking) onThinking(parsed.delta.thinking);
              }
              if (parsed.delta?.type === 'input_json_delta' && parsed.delta?.partial_json !== undefined) {
                currentToolInput += parsed.delta.partial_json;
              }
              const text = parsed.delta?.text;
              if (text) {
                fullContent += text;
                onChunk(text);
              }
            }
            if (parsed.type === 'content_block_stop') {
              if (currentToolCall) {
                currentToolCall.function.arguments = currentToolInput;
                toolCalls.push(currentToolCall);
                if (onToolCall) {
                  onToolCall(currentToolCall);
                }
                currentToolCall = null;
                currentToolInput = '';
              }
            }
            if (parsed.type === 'message_delta' && parsed.usage) {
              usageData = {
                promptTokens: parsed.usage.input_tokens,
                completionTokens: parsed.usage.output_tokens,
                totalTokens: (parsed.usage.input_tokens || 0) + (parsed.usage.output_tokens || 0),
              };
              if (onUsage && usageData) {
                onUsage(usageData);
              }
            }
            if (parsed.type === 'error') {
              throw new AIAPIError(
                `Anthropic 流错误: ${parsed.error?.message || JSON.stringify(parsed.error)}`,
                'server',
              );
            }
          } catch (e) {
            if (e instanceof AIAPIError) throw e;
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
      thinkingSignature,
      redacted: redactedThinking || undefined,
      usage: usageData,
    };
  }

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    // 非流式调用：使用流式但缓冲所有内容
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

export const anthropicAdapterFactory = () => new AnthropicAdapter();
