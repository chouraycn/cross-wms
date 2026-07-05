/**
 * OpenAI Completions API 适配器
 *
 * 支持 OpenAI 传统 Completions API 格式（GPT-3 系列等旧模型）。
 * 注意：Completions API 已被 Chat Completions API 取代，这里仅为兼容性保留。
 */

import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { logger } from '../logger.js';

/**
 * 将消息列表转换为 Completions API 的 prompt 字符串
 */
function messagesToPrompt(messages: Array<{ role: string; content: MessageContent }>): string {
  const parts: string[] = [];
  for (const msg of messages) {
    const content = typeof msg.content === 'string'
      ? msg.content
      : msg.content.map(c => 'text' in c ? c.text : '').join('\n');

    switch (msg.role) {
      case 'system':
        parts.push(`System: ${content}`);
        break;
      case 'user':
        parts.push(`User: ${content}`);
        break;
      case 'assistant':
        parts.push(`Assistant: ${content}`);
        break;
      default:
        parts.push(`${msg.role}: ${content}`);
    }
  }
  parts.push('Assistant:');
  return parts.join('\n\n');
}

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

export class OpenAICompletionsAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'openai-completions';

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

    if (tools && tools.length > 0) {
      logger.warn('[OpenAICompletionsAdapter] Completions API 不支持 Tool Calling，忽略 tools 参数');
    }

    let endpoint = apiEndpoint.replace(/\/+$/, '');
    if (!endpoint.endsWith('/completions')) {
      endpoint += '/completions';
    }

    const prompt = messagesToPrompt(messages);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey && apiKey.trim()) {
      const mode = authMode || 'api-key';
      if (mode === 'api-key' || mode === 'token' || mode === 'oauth') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
    }

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    const body: Record<string, unknown> = {
      model: modelId,
      prompt,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    if (topP !== undefined) {
      body.top_p = topP;
    }

    // Completions API 通常不支持 reasoning_effort，这里仅做兼容处理
    const supportsReasoning = compat?.supportsReasoning ?? capabilities?.includes('reasoning');
    const reasoningEffort = normalizeThinkingEffort(thinkingLevel);
    if (supportsReasoning && reasoningEffort) {
      body.reasoning_effort = reasoningEffort;
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
        `Completions API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
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
              const text = parsed.choices?.[0]?.text;
              if (text) {
                fullContent += text;
                onChunk(text);
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
            const text = parsed.choices?.[0]?.text;
            if (text) {
              fullContent += text;
              onChunk(text);
            }

            // 尝试解析 reasoning 内容（部分兼容 API 可能支持）
            const reasoningText = parsed.choices?.[0]?.reasoning_content ||
              parsed.choices?.[0]?.reasoning ||
              parsed.reasoning_content;
            if (reasoningText && onThinking) {
              reasoningContent += reasoningText;
              onThinking(reasoningText);
            }

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

    const result = await this.callStream(
      config,
      messages,
      {
        onChunk: (text) => { fullContent += text; },
        onThinking: (text) => { reasoningContent += text; },
      },
      tools,
    );

    return result;
  }
}

export const openAICompletionsAdapterFactory = () => new OpenAICompletionsAdapter();
