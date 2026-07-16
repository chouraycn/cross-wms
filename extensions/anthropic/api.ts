/**
 * Anthropic Messages API 封装
 *
 * 支持 Anthropic 原生 Messages API 格式，包括：
 * - 流式 SSE 响应（stream: true）
 * - 非流式响应（stream: false）
 * - Tool Calling (tool_use / tool_result)
 * - Thinking / Extended Thinking
 * - Vision (图片输入)
 * - Prompt Cache (cache_control)
 *
 * 移植自 server/adapters/anthropicAdapter.ts，适配扩展化接口。
 */

// ===================== 类型定义 =====================

/** Anthropic 消息内容块 */
export type AnthropicContentBlock =
  | { type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string }; cache_control?: { type: 'ephemeral' } }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; cache_control?: { type: 'ephemeral' } }
  | { type: 'tool_result'; tool_use_id: string; content: string; cache_control?: { type: 'ephemeral' } };

/** Anthropic 消息 */
export interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/** 通用消息格式（用于输入） */
export interface ChatMessage {
  role: string;
  content: MessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

/** 消息内容类型 */
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}>;

/** Tool 定义 */
export interface ToolDefinition {
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Tool 调用 */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

/** AI 响应 */
export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  thinkingSignature?: string;
  redacted?: boolean;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

/** 流式回调 */
export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onUsage?: (usage: AIResponse['usage']) => void;
}

/** API 调用配置 */
export interface AnthropicCallConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  authMode?: 'api-key' | 'bearer' | 'token' | 'oauth' | 'none';
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  thinkingLevel?: string;
  thinkingBudgetRatio?: number;
  signal?: AbortSignal;
  /** API 版本头 */
  apiVersion?: string;
  /** 额外请求头 */
  extraHeaders?: Record<string, string>;
  /** 额外请求体参数 */
  extraBodyParams?: Record<string, unknown>;
  /** Prompt Cache 配置 */
  cacheBreakpoints?: ('system' | 'tools' | 'last-user')[];
  supportsPromptCache?: boolean;
  /** 工具选择 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/** Anthropic API 错误 */
export class AnthropicAPIError extends Error {
  category: string;
  status?: number;
  body?: string;

  constructor(message: string, category: string, status?: number, body?: string) {
    super(message);
    this.name = 'AnthropicAPIError';
    this.category = category;
    this.status = status;
    this.body = body;
  }
}

// ===================== 消息转换 =====================

/**
 * 将通用消息格式转换为 Anthropic 格式
 */
export function convertMessagesToAnthropic(
  messages: ChatMessage[],
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
          const url = part.image_url.url;
          if (url.startsWith('data:')) {
            const match = url.match(/^data:([^;]+);base64,(.+)$/);
            if (match) {
              blocks.push({
                type: 'image',
                source: { type: 'base64', media_type: match[1], data: match[2] },
              });
            }
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

  // 'last-user' 缓存断点
  if (cacheBreakpoints?.includes('last-user') && anthropicMessages.length > 0) {
    for (let i = anthropicMessages.length - 1; i >= 0; i--) {
      const msg = anthropicMessages[i];
      if (msg.role !== 'user') continue;
      if (typeof msg.content === 'string') {
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
export function convertToolsToAnthropic(
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
    (result[result.length - 1] as Record<string, unknown>).cache_control = { type: 'ephemeral' };
  }
  return result;
}

// ===================== 工具函数 =====================

/**
 * 判断思考级别是否有效（非 off）
 */
export function isThinkingEnabled(level?: string | null): boolean {
  if (!level) return false;
  const normalized = level.toLowerCase().trim();
  return normalized !== 'off' && normalized !== 'disable' && normalized !== '0' && normalized !== 'false';
}

/**
 * 错误分类
 */
function classifyError(status: number, _body: string): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  if (status === 400) return 'validation';
  return 'unknown';
}

/**
 * 提取 Anthropic thinking 签名（简化版，不依赖 server 内部模块）
 */
function extractThinkingSignature(contentBlock: Record<string, unknown>): { signature?: string; redacted?: boolean } | null {
  if (contentBlock.type === 'redacted_thinking') {
    const id = contentBlock.id as string | undefined;
    if (id) {
      return { signature: JSON.stringify({ id, redacted: true }), redacted: true };
    }
    return { redacted: true };
  }
  if (contentBlock.type === 'thinking') {
    const id = contentBlock.id as string | undefined;
    if (id) {
      return { signature: JSON.stringify({ id }), redacted: false };
    }
  }
  return null;
}

// ===================== 核心实现 =====================

/**
 * Anthropic Messages API 调用（流式）
 */
export async function callAnthropicStream(
  config: AnthropicCallConfig,
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
    maxTokens = 1024,
    thinkingLevel,
    thinkingBudgetRatio = 0.3,
    signal,
    apiVersion,
    extraHeaders,
    extraBodyParams,
    cacheBreakpoints,
    supportsPromptCache,
    toolChoice,
  } = config;

  const { onChunk, onThinking, onToolCall, onUsage } = callbacks;

  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/messages')) {
    endpoint += '/messages';
  }

  const { systemPrompt, anthropicMessages } = convertMessagesToAnthropic(
    messages,
    cacheBreakpoints,
  );

  const body: Record<string, unknown> = {
    model: modelId,
    messages: anthropicMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  if (systemPrompt && supportsPromptCache) {
    body.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  } else if (systemPrompt) {
    body.system = systemPrompt;
  }

  // 思考控制
  if (isThinkingEnabled(thinkingLevel)) {
    const level = thinkingLevel!.toLowerCase().trim();
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
      thinkingBudget = Math.floor(maxTokens * thinkingBudgetRatio);
    }
    body.thinking = { type: 'enabled', thinking_budget_tokens: thinkingBudget };
  }

  if (tools && tools.length > 0) {
    body.tools = convertToolsToAnthropic(tools, cacheBreakpoints?.includes('tools'));
    body.tool_choice = toolChoice ?? { type: 'auto' };
  }

  // 自定义 body 参数
  if (extraBodyParams) {
    Object.assign(body, extraBodyParams);
  }

  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'anthropic-version': apiVersion || '2023-06-01',
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
  if (extraHeaders) {
    Object.assign(reqHeaders, extraHeaders);
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
      throw new AnthropicAPIError(
        `无法连接到 Anthropic API，请确认服务已启动。错误：${errMsg}`,
        'network',
      );
    }
    throw fetchErr;
  }

  if (!response.ok) {
    const errorText = await response.text();
    const category = classifyError(response.status, errorText);
    throw new AnthropicAPIError(
      `Anthropic API 请求失败 (${response.status}): ${errorText.slice(0, 500)}`,
      category,
      response.status,
      errorText,
    );
  }

  const reader = response.body?.getReader();
  if (!reader) throw new AnthropicAPIError('无法获取响应流', 'server');

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
              const sigInfo = extractThinkingSignature(contentBlock);
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
            throw new AnthropicAPIError(
              `Anthropic 流错误: ${parsed.error?.message || JSON.stringify(parsed.error)}`,
              'server',
            );
          }
        } catch (e) {
          if (e instanceof AnthropicAPIError) throw e;
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

/**
 * Anthropic Messages API 调用（非流式）
 */
export async function callAnthropic(
  config: AnthropicCallConfig,
  messages: ChatMessage[],
  tools?: ToolDefinition[],
): Promise<AIResponse> {
  const result = await callAnthropicStream(
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

/** 默认 API Base URL */
export const ANTHROPIC_DEFAULT_BASE_URL = 'https://api.anthropic.com';

/**
 * 从配置解析 Anthropic base URL
 */
export function resolveAnthropicBaseUrl(config?: Record<string, unknown>): string {
  if (!config) return ANTHROPIC_DEFAULT_BASE_URL;
  const providers = config.models as Record<string, unknown> | undefined;
  const anthropicConfig = providers?.anthropic as Record<string, unknown> | undefined;
  if (typeof anthropicConfig?.baseUrl === 'string' && anthropicConfig.baseUrl.trim()) {
    return anthropicConfig.baseUrl.trim();
  }
  return ANTHROPIC_DEFAULT_BASE_URL;
}
