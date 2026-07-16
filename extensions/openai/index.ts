/**
 * OpenAI Provider Extension 主入口
 *
 * 将 OpenAI Chat Completions 和 Responses API 适配器封装为独立扩展，
 * 通过 ExtensionProvider 接口注册到 cross-wms 运行时。
 *
 * 移植自：
 * - openclaw/extensions/openai/ (扩展结构)
 * - server/adapters/openAIChatAdapter.ts (Chat Completions 逻辑)
 * - server/adapters/openAIResponsesAdapter.ts (Responses API 逻辑)
 */

import type { ExtensionProvider, ExtensionManifest, ExtensionContext } from '../extension-types.js';
import {
  callOpenAIChatStream,
  callOpenAIChat,
} from './api.js';
import {
  resolveConfiguredOpenAIBaseUrl,
  OPENAI_API_BASE_URL,
  type OpenAICallConfig,
  type ChatMessage,
  type StreamCallbacks,
  type ToolDefinition,
  type AIResponse,
} from './shared.js';

/** OpenAI 模型目录 */
const OPENAI_MODELS = [
  {
    id: 'gpt-5.4',
    name: 'GPT-5.4',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 272000,
    maxTokens: 128000,
    cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
  {
    id: 'gpt-5.4-mini',
    name: 'GPT-5.4 mini',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 400000,
    maxTokens: 128000,
    cost: { input: 0.75, output: 4.5, cacheRead: 0.075, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
  {
    id: 'gpt-5.4-nano',
    name: 'GPT-5.4 nano',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 400000,
    maxTokens: 128000,
    cost: { input: 0.2, output: 1.25, cacheRead: 0.02, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
  {
    id: 'gpt-5.5',
    name: 'GPT-5.5',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 1000000,
    maxTokens: 128000,
    cost: { input: 5, output: 30, cacheRead: 0.5, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
  {
    id: 'o3',
    name: 'o3',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 100000,
    cost: { input: 2, output: 8, cacheRead: 0.5, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
  {
    id: 'o4-mini',
    name: 'o4-mini',
    reasoning: true,
    input: ['text', 'image'] as const,
    contextWindow: 200000,
    maxTokens: 100000,
    cost: { input: 1.1, output: 4.4, cacheRead: 0.28, cacheWrite: 0 },
    api: 'openai-responses' as const,
  },
] as const;

/** 扩展清单 */
const manifest: ExtensionManifest = {
  id: 'openai',
  name: 'OpenAI Provider',
  description: 'OpenAI LLM provider extension with Chat Completions and Responses API support',
  version: '1.0.0',
  kind: 'provider',
  sdkVersion: '1.0.0',
  requiresAuth: true,
  authType: 'api-key',
};

/**
 * OpenAI Provider 扩展
 *
 * 注册逻辑：
 * 1. 从 context.secrets 获取 OPENAI_API_KEY
 * 2. 注册 OpenAI Chat Completions 和 Responses API 适配器
 * 3. 注册 OpenAI 模型目录
 * 4. 注册 OpenAI API Provider
 */
export default class OpenAIProvider implements ExtensionProvider {
  manifest = manifest;

  register(context: ExtensionContext): void {
    context.logger.info('Registering OpenAI provider extension');

    const apiKey = context.secrets('OPENAI_API_KEY');
    if (!apiKey) {
      context.logger.warn('OPENAI_API_KEY not found in environment');
    }

    const baseUrl = resolveConfiguredOpenAIBaseUrl(context.config);

    // 注册适配器到全局 registry
    this.registerAdapters(context);

    // 注册模型到 registry
    this.registerModels(context, baseUrl);

    context.logger.info(`OpenAI provider registered (baseUrl=${baseUrl})`);
  }

  /**
   * 注册 OpenAI Chat Completions 和 Responses API 适配器
   */
  private registerAdapters(context: ExtensionContext): void {
    try {
      import('../../server/adapters/registry.js').then(({ registerAdapter }) => {
        // Chat Completions 适配器
        registerAdapter('openai-chat', () => {
          return () => new OpenAIChatExtensionAdapter();
        });

        // Responses API 适配器
        registerAdapter('openai-responses', () => {
          return () => new OpenAIResponsesExtensionAdapter();
        });

        context.logger.info('OpenAI adapters registered in adapter registry');
      }).catch((err: unknown) => {
        context.logger.warn('Could not register OpenAI adapters in global registry:', err);
      });
    } catch {
      context.logger.warn('Could not import adapter registry for OpenAI registration');
    }
  }

  /**
   * 注册 OpenAI 模型目录
   */
  private registerModels(context: ExtensionContext, baseUrl: string): void {
    try {
      import('../../server/engine/llm/model-registry.js').then(({ registerModel }) => {
        for (const model of OPENAI_MODELS) {
          registerModel({
            id: model.id,
            name: model.name,
            provider: 'openai',
            api: model.api,
            contextWindow: model.contextWindow,
            maxOutputTokens: model.maxTokens,
            cost: { ...model.cost },
            reasoning: model.reasoning,
          });
        }
        context.logger.info(`Registered ${OPENAI_MODELS.length} OpenAI models`);
      }).catch((err: unknown) => {
        context.logger.warn('Could not register OpenAI models:', err);
      });
    } catch {
      context.logger.warn('Could not import model registry for OpenAI registration');
    }
  }

  unregister(): void {
    // 清理注册（如果需要）
  }
}

/**
 * OpenAI Chat Completions 扩展适配器
 */
class OpenAIChatExtensionAdapter {
  readonly apiType = 'openai-chat' as const;

  async callStream(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const callConfig: OpenAICallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as OpenAICallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      topP: config.topP as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
      compat: config.compat as OpenAICallConfig['compat'],
      mediaInput: config.mediaInput as OpenAICallConfig['mediaInput'],
      toolChoice: config.toolChoice as OpenAICallConfig['toolChoice'],
    };
    return callOpenAIChatStream(callConfig, messages, callbacks, tools);
  }

  async call(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    const callConfig: OpenAICallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as OpenAICallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      topP: config.topP as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
    };
    return callOpenAIChat(callConfig, messages, tools);
  }
}

/**
 * OpenAI Responses API 扩展适配器
 *
 * 支持 OpenAI Responses API (POST /v1/responses) 格式。
 * 移植自 server/adapters/openAIResponsesAdapter.ts。
 */
class OpenAIResponsesExtensionAdapter {
  readonly apiType = 'openai-responses' as const;

  async callStream(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    // Responses API 委托给 api.ts 中的实现
    const callConfig: OpenAICallConfig = {
      apiEndpoint: config.apiEndpoint as string,
      apiKey: config.apiKey as string | undefined,
      modelId: config.modelId as string,
      authMode: config.authMode as OpenAICallConfig['authMode'],
      temperature: config.temperature as number | undefined,
      topP: config.topP as number | undefined,
      maxTokens: config.maxTokens as number | undefined,
      thinkingLevel: config.thinkingLevel as string | undefined,
      signal: config.signal as AbortSignal | undefined,
      compat: config.compat as OpenAICallConfig['compat'],
      toolChoice: config.toolChoice as OpenAICallConfig['toolChoice'],
    };
    return callOpenAIResponsesStream(callConfig, messages, callbacks, tools);
  }

  async call(
    config: Record<string, unknown>,
    messages: ChatMessage[],
    tools?: ToolDefinition[],
  ): Promise<AIResponse> {
    return callOpenAIResponsesStream(
      {
        apiEndpoint: config.apiEndpoint as string,
        apiKey: config.apiKey as string | undefined,
        modelId: config.modelId as string,
        authMode: config.authMode as OpenAICallConfig['authMode'],
        temperature: config.temperature as number | undefined,
        maxTokens: config.maxTokens as number | undefined,
        thinkingLevel: config.thinkingLevel as string | undefined,
        signal: config.signal as AbortSignal | undefined,
      },
      messages,
      { onChunk: () => {}, onThinking: () => {}, onToolCall: () => {} },
      tools,
    );
  }
}

// ===================== Responses API 内联实现 =====================

import {
  isThinkingEnabled as isRespThinkingEnabled,
  normalizeThinkingEffort as normalizeRespThinkingEffort,
  isLocalEndpoint as isRespLocalEndpoint,
  classifyError as classifyRespError,
  OpenAIAPIError,
} from './shared.js';

/**
 * 将消息内容转为 Responses API 的 content 数组
 */
function messageContentToResponsesContent(
  content: import('./shared.js').MessageContent,
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
  messages: ChatMessage[],
): Array<Record<string, unknown>> {
  const input: Array<Record<string, unknown>> = [];

  for (const msg of messages) {
    const role = msg.role;

    // tool 结果消息 → function_call_output
    if (role === 'tool') {
      const callId = msg.tool_call_id;
      const outputContent =
        typeof msg.content === 'string'
          ? msg.content
          : msg.content.map(c => 'text' in c ? c.text : '').join('\n');
      input.push({
        type: 'function_call_output',
        call_id: callId || '',
        output: outputContent,
      });
      continue;
    }

    // assistant 消息
    if (role === 'assistant') {
      const toolCalls = msg.tool_calls;

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

      // reasoning 签名回传
      const reasoningSig = msg.reasoningSignature || msg.thinkingSignature;
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
 */
function toResponsesTools(tools: ToolDefinition[]): Array<Record<string, unknown>> {
  return tools.map(tool => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
}

/**
 * 提取 OpenAI Responses thinking 签名
 */
function extractResponsesThinkingSignature(item: Record<string, unknown>): { signature?: string; redacted?: boolean } | null {
  const id = item.id as string | undefined;
  const encryptedContent = item.encrypted_content as string | undefined;
  if (encryptedContent) {
    return {
      signature: JSON.stringify({ id, encrypted_content: encryptedContent }),
      redacted: false,
    };
  }
  if (id) {
    return { signature: JSON.stringify({ id }), redacted: false };
  }
  return null;
}

/**
 * OpenAI Responses API 流式调用
 */
async function callOpenAIResponsesStream(
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
    toolChoice,
  } = config;

  const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

  // 端点补全
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/responses')) {
    endpoint += '/responses';
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
  body.max_output_tokens = maxTokens;

  // 思考级别控制
  const supportsReasoning = compat?.supportsReasoning;
  const reasoningEffort = normalizeRespThinkingEffort(thinkingLevel);
  if (supportsReasoning && reasoningEffort) {
    body.reasoning = { effort: reasoningEffort };
  }

  // Tool Calling
  const supportsToolCalls = compat?.supportsToolCalls ?? true;
  if (tools && tools.length > 0 && supportsToolCalls) {
    if (!isRespLocalEndpoint(apiEndpoint)) {
      body.tools = toResponsesTools(tools);
    }
    if (toolChoice) {
      if (toolChoice === 'auto' || toolChoice === 'none') {
        body.tool_choice = toolChoice;
      } else {
        body.tool_choice = {
          type: 'function',
          name: toolChoice.function.name,
        };
      }
    }
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
    const category = classifyRespError(response.status, errorText);
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
  let thinkingSignature: string | undefined;
  let redacted = false;
  let usageData: AIResponse['usage'];

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

        let dataStr: string | null = null;
        if (trimmed.startsWith('data: ')) {
          dataStr = trimmed.slice(6);
        } else if (trimmed.startsWith('data:')) {
          dataStr = trimmed.slice(5);
        } else {
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

        // 输出项新增
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
              const sig = extractResponsesThinkingSignature(item);
              if (sig?.signature) {
                thinkingSignature = sig.signature;
                redacted = sig.redacted ?? false;
              }
            }
          }
          continue;
        }

        // 输出项完成
        if (eventType === 'response.output_item.done') {
          const item = parsed.item as Record<string, unknown> | undefined;
          if (item && item.type === 'reasoning') {
            const sig = extractResponsesThinkingSignature(item);
            if (sig?.signature) {
              thinkingSignature = sig.signature;
              redacted = sig.redacted ?? false;
            }
          }
          continue;
        }

        // 响应完成
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
          // 解析最终 output
          const output = resp.output as Array<Record<string, unknown>> | undefined;
          if (Array.isArray(output)) {
            for (const outItem of output) {
              if (outItem.type === 'reasoning') {
                const sig = extractResponsesThinkingSignature(outItem);
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

// 导出公共 API
export {
  callOpenAIChatStream,
  callOpenAIChat,
  resolveConfiguredOpenAIBaseUrl,
  OPENAI_API_BASE_URL,
  OPENAI_MODELS,
};
export type { OpenAICallConfig, ChatMessage, StreamCallbacks, ToolDefinition, AIResponse };
