/**
 * OpenAI Responses API 适配器
 *
 * 支持 OpenAI Responses API（POST /v1/responses）格式，包括：
 * - 使用 input 替代 messages 的请求体
 * - 流式 SSE 响应（response.output_text.delta 等事件）
 * - Tool Calling（function_call 输出项）
 * - Reasoning / Thinking（reasoning 输出项 + encrypted_content 签名）
 * - Vision（图片输入）
 * - 多种 Provider 兼容
 */

import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { extractOpenAIResponsesThinkingSignature } from '../engine/thinkingSignatureManager.js';
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
 * 规范化思考级别为 reasoning effort 值
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
 * 将消息内容（string | content array）转为 Responses API 的 content 数组
 *
 * Responses API 使用 input_text / output_text / input_image 作为内容块类型：
 * - user 消息：input_text / input_image
 * - assistant 消息：output_text
 */
function messageContentToResponsesContent(
  content: MessageContent,
  role: string,
): Array<Record<string, unknown>> {
  const isAssistant = role === 'assistant';
  const textType = isAssistant ? 'output_text' : 'input_text';

  if (typeof content === 'string') {
    return [{ type: textType, text: content }];
  }

  const parts: Array<Record<string, unknown>> = [];
  for (const part of content) {
    if (part.type === 'text' && part.text !== undefined) {
      parts.push({ type: textType, text: part.text });
    } else if (part.type === 'image_url' && part.image_url?.url) {
      parts.push({ type: 'input_image', image_url: part.image_url.url });
    }
  }
  return parts;
}

/**
 * 将 Chat Completions 风格的消息列表转换为 Responses API 的 input 数组
 */
function messagesToResponsesInput(
  messages: Array<{ role: string; content: MessageContent }>,
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = msg.role;

    // tool 结果消息 → function_call_output
    if (role === 'tool') {
      const toolMsg = msg as Record<string, unknown>;
      const callId = toolMsg.tool_call_id as string | undefined;
      const outputContent =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(c => ('text' in c ? c.text : '')).join('\n');
      input.push({
        type: 'function_call_output',
        call_id: callId || '',
        output: outputContent,
      });
      continue;
    }

    // assistant 消息可能携带 tool_calls → 拆分为 message + function_call 项
    if (role === 'assistant') {
      const assistantMsg = msg as Record<string, unknown>;
      const toolCalls = assistantMsg.tool_calls as Array<{
        id: string;
        function: { name: string; arguments: string };
      }> | undefined;

      // 仅当有文本内容时才输出 message 项
      const hasText =
        typeof msg.content === 'string'
          ? msg.content.length > 0
          : msg.content.some(c => c.type === 'text' && c.text);

      if (hasText) {
        input.push({
          type: 'message',
          role: 'assistant',
          content: messageContentToResponsesContent(msg.content, role),
        });
      }

      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          input.push({
            type: 'function_call',
            call_id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          });
        }
      }

      // reasoning 签名回传（多轮对话连续性）
      const reasoningSig =
        (assistantMsg.reasoningSignature as string | undefined) ||
        (assistantMsg.thinkingSignature as string | undefined);
      if (reasoningSig) {
        try {
          const parsed = JSON.parse(reasoningSig) as Record<string, unknown>;
          const reasoningItem: Record<string, unknown> = { type: 'reasoning' };
          if (typeof parsed.id === 'string') reasoningItem.id = parsed.id;
          if (typeof parsed.encrypted_content === 'string') {
            reasoningItem.encrypted_content = parsed.encrypted_content;
          }
          input.push(reasoningItem);
        } catch {
          // 非签名 JSON，视为 reasoning id
          input.push({ type: 'reasoning', id: reasoningSig });
        }
      }
      continue;
    }

    // system / user / developer 消息
    input.push({
      type: 'message',
      role,
      content: messageContentToResponsesContent(msg.content, role),
    });
  }

  return input;
}

/**
 * 将 ToolDefinition 转换为 Responses API 的 tools 格式
 *
 * Responses API 的 tools 使用顶层 name/description/parameters（非 function 嵌套）：
 * { type: 'function', name, description, parameters }
 */
function toResponsesTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map(tool => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

export class OpenAIResponsesAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'openai-responses';

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

    // 端点补全：确保以 /responses 结尾
    let endpoint = apiEndpoint.replace(/\/+$/, '');
    if (!endpoint.endsWith('/responses')) {
      endpoint += '/responses';
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

    // 构建请求体：input 替代 messages
    const input = messagesToResponsesInput(messages);
    const body: Record<string, unknown> = {
      model: modelId,
      input,
      stream: true,
    };
    if (temperature !== undefined) {
      body.temperature = temperature;
    }
    if (topP !== undefined) {
      body.top_p = topP;
    }
    // Responses API 使用 max_output_tokens
    body.max_output_tokens = maxTokens;

    // 思考级别控制：Responses API 使用 reasoning.effort
    const supportsReasoning = compat?.supportsReasoning ?? capabilities?.includes('reasoning');
    const reasoningEffort = normalizeThinkingEffort(thinkingLevel);
    if (supportsReasoning && reasoningEffort) {
      body.reasoning = { effort: reasoningEffort };
    }

    // Tool Calling
    const supportsToolCalls = compat?.supportsToolCalls ?? true;
    if (tools && tools.length > 0 && supportsToolCalls) {
      // 本地模型不发送 tools（优化首响应速度）
      const isLocal = /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.:11434/.test(apiEndpoint);
      if (isLocal) {
        logger.debug(`[OpenAIResponsesAdapter] 本地模型跳过 tools 参数 (model=${modelId}, tools=${tools.length})`);
      } else {
        body.tools = toResponsesTools(tools);
      }
      if (config.toolChoice) {
        if (config.toolChoice === 'auto' || config.toolChoice === 'none') {
          body.tool_choice = config.toolChoice;
        } else {
          // { type: 'function', function: { name } } → Responses API 使用 { type: 'function', name }
          body.tool_choice = {
            type: 'function',
            name: config.toolChoice.function.name,
          };
        }
      }
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
    let thinkingSignature: string | undefined;
    let redacted = false;
    let usageData: AIResponse['usage'];

    // tool call 状态：按 item_id 累积 arguments
    const toolCalls: ToolCall[] = [];
    const toolCallByItemId = new Map<string, ToolCall>();

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

          // 部分实现可能不使用 data: 前缀
          let dataStr: string | null = null;
          if (trimmed.startsWith('data: ')) {
            dataStr = trimmed.slice(6);
          } else if (trimmed.startsWith('data:')) {
            dataStr = trimmed.slice(5);
          } else {
            // 尝试直接解析 JSON
            dataStr = trimmed;
          }

          if (dataStr === '[DONE]' || dataStr === 'DONE') continue;

          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(dataStr) as Record<string, unknown>;
          } catch {
            continue;
          }

          const eventType = parsed.type as string | undefined;

          // 文本增量
          if (eventType === 'response.output_text.delta') {
            const delta = parsed.delta as string | undefined;
            if (delta && typeof delta === 'string') {
              fullContent += delta;
              onChunk(delta);
            }
            continue;
          }

          // reasoning 增量
          if (eventType === 'response.reasoning.delta') {
            const delta = parsed.delta as string | undefined;
            if (delta && typeof delta === 'string') {
              reasoningContent += delta;
              if (onThinking) onThinking(delta);
            }
            continue;
          }

          // function call 参数增量
          if (eventType === 'response.function_call_arguments.delta') {
            const itemId = parsed.item_id as string | undefined;
            const delta = parsed.delta as string | undefined;
            if (itemId && delta) {
              let tc = toolCallByItemId.get(itemId);
              if (!tc) {
                tc = {
                  id: itemId,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
                toolCallByItemId.set(itemId, tc);
                toolCalls.push(tc);
                if (onToolCall) onToolCall(tc);
              }
              tc.function.arguments += delta;
            }
            continue;
          }

          // 输出项新增：function_call / reasoning
          if (eventType === 'response.output_item.added') {
            const item = parsed.item as Record<string, unknown> | undefined;
            if (item) {
              const itemType = item.type as string | undefined;
              if (itemType === 'function_call') {
                const itemId = (item.id as string) || (parsed.item_id as string) || '';
                const callId = (item.call_id as string) || itemId;
                const name = (item.name as string) || '';
                const args = (item.arguments as string) || '';
                const tc: ToolCall = {
                  id: callId,
                  type: 'function',
                  function: { name, arguments: args },
                };
                if (itemId) {
                  toolCallByItemId.set(itemId, tc);
                }
                toolCalls.push(tc);
                if (onToolCall) onToolCall(tc);
              } else if (itemType === 'reasoning') {
                // 尝试提取签名（可能此时还未包含 encrypted_content）
                const sig = extractOpenAIResponsesThinkingSignature(item);
                if (sig?.signature) {
                  thinkingSignature = sig.signature;
                  redacted = sig.redacted ?? false;
                }
              }
            }
            continue;
          }

          // 输出项完成：提取 reasoning 签名
          if (eventType === 'response.output_item.done') {
            const item = parsed.item as Record<string, unknown> | undefined;
            if (item && item.type === 'reasoning') {
              const sig = extractOpenAIResponsesThinkingSignature(item);
              if (sig?.signature) {
                thinkingSignature = sig.signature;
                redacted = sig.redacted ?? false;
              }
            }
            continue;
          }

          // 响应完成：最终 usage 与 output
          if (eventType === 'response.completed' || eventType === 'response.done') {
            const resp = (parsed.response as Record<string, unknown> | undefined) || parsed;
            const usage = resp.usage as Record<string, unknown> | undefined;
            if (usage) {
              usageData = {
                promptTokens: usage.input_tokens as number | undefined,
                completionTokens: usage.output_tokens as number | undefined,
                thinkingTokens: usage.reasoning_tokens as number | undefined,
                totalTokens: usage.total_tokens as number | undefined,
              };
              if (onUsage && usageData) {
                onUsage(usageData);
              }
            }
            // 解析最终 output 以补全 tool_calls / 签名
            const output = resp.output as Array<Record<string, unknown>> | undefined;
            if (Array.isArray(output)) {
              for (const outItem of output) {
                if (outItem.type === 'reasoning') {
                  const sig = extractOpenAIResponsesThinkingSignature(outItem);
                  if (sig?.signature) {
                    thinkingSignature = sig.signature;
                    redacted = sig.redacted ?? false;
                  }
                }
                if (outItem.type === 'function_call') {
                  const callId = (outItem.call_id as string) || (outItem.id as string) || '';
                  const name = (outItem.name as string) || '';
                  const args = (outItem.arguments as string) || '';
                  if (callId && !toolCalls.some(tc => tc.id === callId)) {
                    const tc: ToolCall = {
                      id: callId,
                      type: 'function',
                      function: { name, arguments: args },
                    };
                    toolCalls.push(tc);
                    if (onToolCall) onToolCall(tc);
                  } else {
                    // 补全已有 tool call 的 name/arguments
                    const existing = toolCalls.find(tc => tc.id === callId);
                    if (existing) {
                      if (name && !existing.function.name) existing.function.name = name;
                      if (args && !existing.function.arguments) existing.function.arguments = args;
                    }
                  }
                }
              }
            }
            continue;
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
      redacted: redacted || undefined,
      usage: usageData,
    };
  }

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const result = await this.callStream(
      config,
      messages,
      {
        onChunk: () => {},
        onThinking: () => {},
        onToolCall: () => {},
      },
      tools,
    );

    return result;
  }
}

export const openAIResponsesAdapterFactory = () => new OpenAIResponsesAdapter();
