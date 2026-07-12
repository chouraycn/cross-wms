/**
 * Azure OpenAI API 适配器
 *
 * 支持 Azure OpenAI Service 的 Chat Completions API：
 * - 端点格式: {endpoint}/openai/deployments/{deployment-id}/chat/completions?api-version={api-version}
 * - 需要 api-key 认证
 * - 需要 api-version 参数
 * - 支持 streaming、tool calling、vision
 *
 * v1.7.86: Initial implementation
 */

import type { IAiApiAdapter, ModelApiType, AdapterConfig, StreamCallbacks } from './types.js';
import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';
import { AIAPIError, classifyError } from '../aiClient.js';
import { logger } from '../logger.js';

/**
 * 从配置中提取 Azure 特定参数
 */
function extractAzureParams(config: AdapterConfig): {
  endpoint: string;
  deploymentId: string;
  apiVersion: string;
} {
  const { apiEndpoint, compat } = config;

  // Azure OpenAI endpoint 格式：
  // https://{resource-name}.openai.azure.com/openai/deployments/{deployment-id}/chat/completions?api-version={api-version}
  // 或简写: https://{resource-name}.openai.azure.com

  let endpoint = apiEndpoint.replace(/\/+$/, '');
  let deploymentId = '';
  const apiVersion = compat?.apiVersion || '2024-02-15-preview';

  // 尝试从 endpoint 提取 deployment-id
  const deployMatch = endpoint.match(/\/deployments\/([^\/]+)/);
  if (deployMatch) {
    deploymentId = deployMatch[1];
    // 移除 deployments 部分，稍后重新构建
    endpoint = endpoint.replace(/\/deployments\/[^\/]+/, '').replace(/\/chat\/completions.*$/, '');
  }

  // 如果 endpoint 中没有 deployment-id，尝试从 modelId 获取
  if (!deploymentId) {
    deploymentId = config.modelId;
  }

  // 构建完整 endpoint
  if (!endpoint.includes('/openai/deployments')) {
    endpoint = `${endpoint}/openai/deployments/${deploymentId}/chat/completions`;
  }

  // 添加 api-version 参数
  if (!endpoint.includes('api-version')) {
    endpoint = `${endpoint}?api-version=${apiVersion}`;
  }

  return { endpoint, deploymentId, apiVersion };
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

export class AzureOpenAIAdapter implements IAiApiAdapter {
  readonly apiType: ModelApiType = 'azure-openai';

  async callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const {
      apiKey,
      modelId,
      temperature = 0.7,
      topP,
      maxTokens = 1024,
      signal,
      compat,
    } = config;

    const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

    // 提取 Azure 特定参数
    const { endpoint } = extractAzureParams(config);

    // 角色映射
    const processedMessages = applyRoleMapping(messages, compat?.roleMap);

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-key': apiKey || '',
    };

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    // 构建请求体
    const body: Record<string, unknown> = {
      messages: processedMessages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    };
    if (topP !== undefined) {
      body.top_p = topP;
    }

    // Tool Calling
    if (tools && tools.length > 0 && compat?.supportsToolCalls !== false) {
      body.tools = tools;
      body.tool_choice = config.toolChoice ?? 'auto';
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
          `无法连接到 Azure OpenAI 服务，请确认服务已启动。错误：${errMsg}`,
          'network',
        );
      }
      throw fetchErr;
    }

    if (!response.ok) {
      const errorText = await response.text();
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Azure OpenAI API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
        category,
        response.status,
        errorText,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) throw new AIAPIError('无法获取响应流', 'server');

    const decoder = new TextDecoder();
    let fullContent = '';
    let buffer = '';

    const toolCalls: ToolCall[] = [];
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
            const delta = parsed.choices?.[0]?.delta;
            const usage = parsed.usage;

            if (usage) {
              usageData = usage;
              if (onUsage) onUsage(usage);
            }

            // 处理文本内容
            if (delta?.content) {
              fullContent += delta.content;
              onChunk(delta.content);
            }

            // 处理 tool calls
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCalls[idx]) {
                  toolCalls[idx] = {
                    id: tc.id || '',
                    type: 'function',
                    function: {
                      name: '',
                      arguments: '',
                    },
                  };
                }

                if (tc.id) toolCalls[idx].id = tc.id;
                if (tc.function?.name) toolCalls[idx].function.name = tc.function.name;
                if (tc.function?.arguments) {
                  toolCalls[idx].function.arguments += tc.function.arguments;
                }

                if (onToolCall && tc.function?.arguments) {
                  onToolCall(toolCalls[idx]);
                }
              }
            }
          } catch {
            // 解析错误，忽略
          }
        }
      }
    } catch (streamErr) {
      const errMsg = streamErr instanceof Error ? streamErr.message : String(streamErr);
      throw new AIAPIError(`流处理错误: ${errMsg}`, 'server');
    }

    return {
      content: fullContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: usageData,
    };
  }

  async call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const {
      apiKey,
      temperature = 0.7,
      topP,
      maxTokens = 1024,
      signal,
      compat,
    } = config;

    // 提取 Azure 特定参数
    const { endpoint } = extractAzureParams(config);

    // 角色映射
    const processedMessages = applyRoleMapping(messages, compat?.roleMap);

    // 构建请求头
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'api-key': apiKey || '',
    };

    // 自定义请求头
    if (compat?.extraHeaders) {
      Object.assign(headers, compat.extraHeaders);
    }

    // 构建请求体
    const body: Record<string, unknown> = {
      messages: processedMessages,
      temperature,
      max_tokens: maxTokens,
    };
    if (topP !== undefined) {
      body.top_p = topP;
    }

    // Tool Calling
    if (tools && tools.length > 0 && compat?.supportsToolCalls !== false) {
      body.tools = tools;
      body.tool_choice = config.toolChoice ?? 'auto';
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
      throw new AIAPIError(`无法连接到 Azure OpenAI 服务: ${errMsg}`, 'network');
    }

    if (!response.ok) {
      const errorText = await response.text();
      const category = classifyError(response.status, errorText);
      throw new AIAPIError(
        `Azure OpenAI API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
        category,
        response.status,
        errorText,
      );
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    return {
      content: choice?.message?.content || '',
      toolCalls: choice?.message?.tool_calls,
      usage: data.usage,
    };
  }
}

/**
 * 适配器工厂函数
 */
export function azureOpenAIAdapterFactory(): IAiApiAdapter {
  return new AzureOpenAIAdapter();
}

export default AzureOpenAIAdapter;