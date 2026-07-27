
/**
 * DeepSeek Chat Completions API 封装
 *
 * DeepSeek API 兼容 OpenAI Chat Completions 格式，支持：
 * - 流式 SSE 响应（stream: true）
 * - 非流式响应（stream: false）
 * - Tool Calling
 * - Reasoning / Thinking（reasoning_effort）
 * - 多种模型
 */

import {
  type ChatMessage,
  type MessageContent,
  type ToolDefinition,
  type ToolCall,
  type AIResponse,
  type StreamCallbacks,
  type DeepSeekCallConfig,
  DeepSeekAPIError,
  isThinkingEnabled,
  normalizeThinkingEffort,
  applyRoleMapping,
  handleSystemMessageFallback,
  isLocalEndpoint,
  classifyError,
} from './shared.js';

/**
 * DeepSeek Chat Completions 流式调用
 */
export async function callDeepSeekStream(
  config: DeepSeekCallConfig,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  tools?: ToolDefinition[],
): Promise&lt;AIResponse&gt; {
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
    toolChoice,
  } = config;

  const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

  let processedMessages = applyRoleMapping(messages, compat?.roleMap);

  if (compat?.supportsSystemMessage === false &amp;&amp; compat?.systemMessageFallback) {
    processedMessages = handleSystemMessageFallback(processedMessages, compat.systemMessageFallback);
  }

  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  const headers: Record&lt;string, string&gt; = {
    'Content-Type': 'application/json',
  };
  if (apiKey &amp;&amp; apiKey.trim()) {
    const mode = authMode || 'api-key';
    if (mode === 'api-key' || mode === 'bearer' || mode === 'token') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  if (compat?.extraHeaders) {
    Object.assign(headers, compat.extraHeaders);
  }

  const body: Record&lt;string, unknown&gt; = {
    model: modelId,
    messages: processedMessages.map(msg =&gt; messageToOpenAIFormat(msg)),
    stream: true,
  };
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  if (topP !== undefined) {
    body.top_p = topP;
  }
  const maxTokensField = compat?.maxTokensField || 'max_tokens';
  body[maxTokensField] = maxTokens;

  const supportsReasoning = compat?.supportsReasoningEffort ?? false;
  const reasoningEffort = normalizeThinkingEffort(thinkingLevel);
  if (supportsReasoning &amp;&amp; reasoningEffort &amp;&amp; isThinkingEnabled(thinkingLevel)) {
    body.reasoning_effort = reasoningEffort;
  }

  if (tools &amp;&amp; tools.length &gt; 0) {
    if (!isLocalEndpoint(apiEndpoint)) {
      body.tools = tools;
    }
    if (toolChoice) {
      if (toolChoice === 'auto' || toolChoice === 'none') {
        body.tool_choice = toolChoice;
      } else {
        body.tool_choice = {
          type: 'function',
          function: { name: toolChoice.function.name },
        };
      }
    }
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
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect')) {
      throw new DeepSeekAPIError(
        `无法连接到 DeepSeek 服务，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const category = classifyError(response.status, errorText);
    throw new DeepSeekAPIError(
      `API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new DeepSeekAPIError('无法获取响应流', 'server');

  const decoder = new TextDecoder();
  let fullContent = '';
  let reasoningContent = '';
  let buffer = '';
  let thinkingSignature: string | undefined;
  let redacted = false;
  let usageData: AIResponse['usage'];

  const toolCalls: ToolCall[] = [];
  const toolCallByIndex = new Map&lt;number, ToolCall&gt;();

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

        let dataStr: string | null = null;
        if (trimmed.startsWith('data: ')) {
          dataStr = trimmed.slice(6);
        } else if (trimmed.startsWith('data:')) {
          dataStr = trimmed.slice(5);
        } else {
          dataStr = trimmed;
        }

        if (dataStr === '[DONE]' || dataStr === 'DONE') continue;

        let parsed: Record&lt;string, unknown&gt;;
        try {
          parsed = JSON.parse(dataStr) as Record&lt;string, unknown&gt;;
        } catch {
          continue;
        }

        const choices = parsed.choices as Array&lt;Record&lt;string, unknown&gt;&gt; | undefined;
        if (!choices || choices.length === 0) continue;

        const choice = choices[0];
        const delta = choice.delta as Record&lt;string, unknown&gt; | undefined;

        if (delta) {
          const content = delta.content as string | undefined;
          if (content &amp;&amp; typeof content === 'string') {
            fullContent += content;
            onChunk(content);
          }

          const reasoningContentDelta = delta.reasoning_content as string | undefined;
          if (reasoningContentDelta &amp;&amp; typeof reasoningContentDelta === 'string') {
            reasoningContent += reasoningContentDelta;
            if (onThinking) onThinking(reasoningContentDelta);
          }

          const toolCallsDelta = delta.tool_calls as Array&lt;Record&lt;string, unknown&gt;&gt; | undefined;
          if (toolCallsDelta &amp;&amp; toolCallsDelta.length &gt; 0) {
            for (const tcDelta of toolCallsDelta) {
              const index = tcDelta.index as number;
              const id = tcDelta.id as string | undefined;
              const functionDelta = tcDelta.function as Record&lt;string, unknown&gt; | undefined;
              const name = functionDelta?.name as string | undefined;
              const args = functionDelta?.arguments as string | undefined;

              let tc = toolCallByIndex.get(index);
              if (!tc) {
                tc = {
                  id: id || `tool_${index}`,
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
                toolCallByIndex.set(index, tc);
                toolCalls.push(tc);
                if (onToolCall) onToolCall(tc);
              }
              if (name) tc.function.name = name;
              if (args) tc.function.arguments += args;
            }
          }
        }

        if (choice.finish_reason) {
          const usage = parsed.usage as Record&lt;string, unknown&gt; | undefined;
          if (usage) {
            usageData = {
              promptTokens: usage.prompt_tokens as number | undefined,
              completionTokens: usage.completion_tokens as number | undefined,
              thinkingTokens: (usage as Record&lt;string, unknown&gt;).prompt_cache_hit_tokens
                ? ((usage as Record&lt;string, unknown&gt;).prompt_cache_hit_tokens as number)
                : undefined,
              totalTokens: usage.total_tokens as number | undefined,
            };
            if (onUsage &amp;&amp; usageData) {
              onUsage(usageData);
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    content: fullContent,
    toolCalls: toolCalls.length &gt; 0 ? toolCalls : undefined,
    reasoningContent: reasoningContent || undefined,
    thinkingSignature,
    redacted: redacted || undefined,
    usage: usageData,
  };
}

/**
 * DeepSeek Chat Completions 非流式调用
 */
export async function callDeepSeek(
  config: DeepSeekCallConfig,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise&lt;AIResponse&gt; {
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
    toolChoice,
  } = config;

  let processedMessages = applyRoleMapping(messages, compat?.roleMap);

  if (compat?.supportsSystemMessage === false &amp;&amp; compat?.systemMessageFallback) {
    processedMessages = handleSystemMessageFallback(processedMessages, compat.systemMessageFallback);
  }

  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  const headers: Record&lt;string, string&gt; = {
    'Content-Type': 'application/json',
  };
  if (apiKey &amp;&amp; apiKey.trim()) {
    const mode = authMode || 'api-key';
    if (mode === 'api-key' || mode === 'bearer' || mode === 'token') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
  }
  if (compat?.extraHeaders) {
    Object.assign(headers, compat.extraHeaders);
  }

  const body: Record&lt;string, unknown&gt; = {
    model: modelId,
    messages: processedMessages.map(msg =&gt; messageToOpenAIFormat(msg)),
    stream: false,
  };
  if (temperature !== undefined) {
    body.temperature = temperature;
  }
  if (topP !== undefined) {
    body.top_p = topP;
  }
  const maxTokensField = compat?.maxTokensField || 'max_tokens';
  body[maxTokensField] = maxTokens;

  const supportsReasoning = compat?.supportsReasoningEffort ?? false;
  const reasoningEffort = normalizeThinkingEffort(thinkingLevel);
  if (supportsReasoning &amp;&amp; reasoningEffort &amp;&amp; isThinkingEnabled(thinkingLevel)) {
    body.reasoning_effort = reasoningEffort;
  }

  if (tools &amp;&amp; tools.length &gt; 0) {
    if (!isLocalEndpoint(apiEndpoint)) {
      body.tools = tools;
    }
    if (toolChoice) {
      if (toolChoice === 'auto' || toolChoice === 'none') {
        body.tool_choice = toolChoice;
      } else {
        body.tool_choice = {
          type: 'function',
          function: { name: toolChoice.function.name },
        };
      }
    }
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
    if (errMsg.includes('ECONNREFUSED') || errMsg.includes('fetch failed') || errMsg.includes('connect')) {
      throw new DeepSeekAPIError(
        `无法连接到 DeepSeek 服务，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const category = classifyError(response.status, errorText);
    throw new DeepSeekAPIError(
      `API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  const data = (await response.json()) as Record&lt;string, unknown&gt;;
  const choices = data.choices as Array&lt;Record&lt;string, unknown&gt;&gt; | undefined;
  const choice = choices?.[0];
  const message = choice?.message as Record&lt;string, unknown&gt; | undefined;

  const content = (message?.content as string) || '';
  const reasoningContent = (message?.reasoning_content as string) || undefined;

  const toolCallsData = message?.tool_calls as Array&lt;Record&lt;string, unknown&gt;&gt; | undefined;
  const toolCalls: ToolCall[] | undefined = toolCallsData?.map(tc =&gt; ({
    id: (tc.id as string) || 'tool_call',
    type: 'function',
    function: {
      name: ((tc.function as Record&lt;string, unknown&gt;)?.name as string) || '',
      arguments: ((tc.function as Record&lt;string, unknown&gt;)?.arguments as string) || '',
    },
  }));

  const usage = data.usage as Record&lt;string, unknown&gt; | undefined;
  const usageData: AIResponse['usage'] | undefined = usage
    ? {
        promptTokens: usage.prompt_tokens as number | undefined,
        completionTokens: usage.completion_tokens as number | undefined,
        thinkingTokens: (usage as Record&lt;string, unknown&gt;).prompt_cache_hit_tokens
          ? ((usage as Record&lt;string, unknown&gt;).prompt_cache_hit_tokens as number)
          : undefined,
        totalTokens: usage.total_tokens as number | undefined,
      }
    : undefined;

  return {
    content,
    toolCalls: toolCalls &amp;&amp; toolCalls.length &gt; 0 ? toolCalls : undefined,
    reasoningContent,
    usage: usageData,
  };
}

/**
 * 将消息转换为 OpenAI 格式
 */
function messageToOpenAIFormat(msg: ChatMessage): Record&lt;string, unknown&gt; {
  const result: Record&lt;string, unknown&gt; = {
    role: msg.role,
    content: msg.content,
  };

  if (msg.tool_calls &amp;&amp; msg.tool_calls.length &gt; 0) {
    result.tool_calls = msg.tool_calls;
  }
  if (msg.tool_call_id) {
    result.tool_call_id = msg.tool_call_id;
  }

  return result;
}

export { resolveConfiguredDeepSeekBaseUrl, DEEPSEEK_API_BASE_URL } from './shared.js';
