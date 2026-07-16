/**
 * OpenAI Chat Completions API 封装
 *
 * 支持 OpenAI Chat Completions API 格式，包括：
 * - 流式 SSE 响应（stream: true）
 * - 非流式响应（stream: false）
 * - Tool Calling
 * - Reasoning / Thinking（reasoning_effort）
 * - Vision (图片输入)
 * - 多种 Provider 兼容
 *
 * 移植自 server/adapters/openAIChatAdapter.ts，适配扩展化接口。
 */

import {
  type ChatMessage,
  type MessageContent,
  type ToolDefinition,
  type ToolCall,
  type AIResponse,
  type StreamCallbacks,
  type OpenAICallConfig,
  type OpenAICompatConfig,
  OpenAIAPIError,
  isThinkingEnabled,
  normalizeThinkingEffort,
  applyRoleMapping,
  handleSystemMessageFallback,
  isLocalEndpoint,
  classifyError,
} from './shared.js';

/**
 * OpenAI Chat Completions 流式调用
 */
export async function callOpenAIChatStream(
  config: OpenAICallConfig,
  messages: ChatMessage[],
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
    thinkingLevel,
    signal,
    compat,
    mediaInput,
    toolChoice,
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
  const maxFileSize = mediaInput?.image?.maxFileSize;
  if (maxImages !== undefined || maxFileSize !== undefined) {
    let imageCount = 0;
    for (const msg of processedMessages) {
      if (Array.isArray(msg.content)) {
        imageCount += msg.content.filter(c => c.type === 'image_url').length;
      }
    }

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
    }

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
                    // 超限警告但不禁用
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // 端点补全
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  // 请求头
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    const mode = authMode || 'api-key';
    if (mode === 'api-key' || mode === 'token' || mode === 'oauth') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  if (compat?.apiVersion) {
    headers['api-version'] = compat.apiVersion;
  }
  if (compat?.extraHeaders) {
    Object.assign(headers, compat.extraHeaders);
  }

  // 请求体
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
  const supportsReasoning = compat?.supportsReasoning;
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
    if (isLocalEndpoint(apiEndpoint)) {
      // 本地模型跳过 tools 参数
    } else {
      body.tools = tools;
    }
    body.tool_choice = toolChoice ?? 'auto';
  }

  // Prompt Cache
  if (compat?.supportsPromptCache) {
    body.prompt_cache_key = `session_${Date.now().toString(36)}`;
  }

  // 自定义 body 参数
  if (compat?.extraBodyParams) {
    Object.assign(body, compat.extraBodyParams);
  }

  // 发送请求
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
      throw new OpenAIAPIError(
        `无法连接到 AI 模型服务，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const category = classifyError(response.status, errorText);
    throw new OpenAIAPIError(
      `API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  // 解析 SSE 流
  const reader = response.body?.getReader();
  if (!reader) throw new OpenAIAPIError('无法获取响应流', 'server');

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

          // reasoning content 多路径解析
          const reasoningDelta =
            delta?.reasoning_content ??
            delta?.reasoning ??
            parsed.reasoning_content ??
            parsed.choices?.[0]?.reasoning_content ??
            (parsed.choices?.[0] as Record<string, unknown>)?.delta?.reasoning_content ??
            delta?.thinking ??
            (parsed as Record<string, unknown>).reasoning ??
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

          // Tool Calling
          if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index ?? 0;
              if (tc.function?.name) {
                currentToolName = tc.function.name;
              }
              if (idx !== currentToolCallIndex) {
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

/**
 * OpenAI Chat Completions 非流式调用
 */
export async function callOpenAIChat(
  config: OpenAICallConfig,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise<AIResponse> {
  const result = await callOpenAIChatStream(
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
