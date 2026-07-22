import type { IAiApiAdapter, AdapterConfig, StreamCallbacks, ModelApiType } from './types.js';
import type { MessageContent, ToolDefinition, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';

export class ClaudeAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'anthropic-messages';

  async callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const {
      apiEndpoint = 'https://api.anthropic.com/v1',
      apiKey,
      modelId,
      authMode = 'api-key',
      temperature = 0.7,
      topP,
      maxTokens = 1024,
      thinkingLevel,
      signal,
      compat,
    } = config;

    const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

    let endpoint = apiEndpoint.replace(/\/+$/, '');
    if (!endpoint.endsWith('/messages')) {
      endpoint += '/messages';
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': compat?.apiVersion || '2023-06-01',
    };
    if (apiKey && apiKey.trim()) {
      const mode = authMode || 'api-key';
      if (mode === 'api-key' || mode === 'token') {
        headers['x-api-key'] = apiKey;
      }
    }

    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    const thinkingBudget = compat?.thinking?.useBudget ? Math.floor(maxTokens * (compat.thinking.budgetRatio || 0.33)) : undefined;

    const body: Record<string, unknown> = {
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };

    if (topP !== undefined) {
      body.top_p = topP;
    }

    if (thinkingLevel && thinkingLevel !== 'off' && thinkingLevel !== 'none') {
      if (thinkingBudget) {
        body.thinking_budget = thinkingBudget;
      } else {
        body.thinking = true;
      }
    }

    const supportsToolCalls = compat?.supportsToolCalls ?? true;
    if (tools && tools.length > 0 && supportsToolCalls) {
      body.tools = tools;
      body.tool_choice = config.toolChoice ?? 'auto';
    }

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
      if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed')) {
        throw new AIAPIError(`无法连接到 Claude 服务。错误：${errMsg}`, 'network');
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(`API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`, category, response.status, errorText);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new AIAPIError('无法获取响应流', 'server');

    const decoder = new TextDecoder();
    let fullContent = '';
    let reasoningContent = '';
    let buffer = '';

    const toolCalls: AIResponse['toolCalls'] = [];
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

          if (!trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'thinking') {
              const thinkingText = parsed.content;
              if (typeof thinkingText === 'string') {
                reasoningContent += thinkingText;
                if (onThinking) onThinking(thinkingText);
              }
            }

            if (parsed.type === 'content_block_delta') {
              const delta = parsed.delta;
              const text = delta?.text;
              if (typeof text === 'string') {
                fullContent += text;
                onChunk(text);
              }
            }

            if (parsed.type === 'tool_use_delta') {
              const delta = parsed.delta;
              const idx = parsed.index ?? 0;
              if (delta?.name) {
                currentToolName = delta.name;
              }
              if (idx !== currentToolCallIndex) {
                currentToolCallIndex = idx;
                toolCalls.push({
                  id: delta?.id || '',
                  type: 'function',
                  function: {
                    name: currentToolName || delta?.name || '',
                    arguments: delta?.arguments ? JSON.stringify(delta.arguments) : '',
                  },
                });
                if (onToolCall) onToolCall(toolCalls[toolCalls.length - 1]);
              } else if (toolCalls.length > 0) {
                const lastCall = toolCalls[toolCalls.length - 1];
                if (delta?.arguments) {
                  const args = typeof delta.arguments === 'string' ? delta.arguments : JSON.stringify(delta.arguments);
                  lastCall.function.arguments = args;
                }
                if (delta?.name) lastCall.function.name = delta.name;
              }
            }

            if (parsed.usage) {
              usageData = {
                promptTokens: parsed.usage.input_tokens,
                completionTokens: parsed.usage.output_tokens,
                totalTokens: parsed.usage.input_tokens + parsed.usage.output_tokens,
              };
              if (onUsage) onUsage(usageData);
            }
          } catch {
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
    return this.callStream(config, messages, {
      onChunk: () => {},
      onThinking: () => {},
      onToolCall: () => {},
    }, tools);
  }
}

export const claudeAdapterFactory = () => new ClaudeAdapter();