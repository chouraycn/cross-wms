/**
 * AI 模型 API 客户端
 *
 * 直接调用 AI 模型 API（OpenAI 兼容格式 / Anthropic 原生格式），
 * 不依赖任何第三方 Agent SDK。
 *
 * 支持流式 SSE 响应和非流式调用，含自动重试、错误分类、超时控制。
 *
 * v1.9.0: 新增 Tool Calling 支持 — 支持 tools 参数传递和 tool_calls 响应解析
 */

// ===================== 类型定义 =====================

import { isLocalModel } from './modelsStore.js';

/** 消息内容类型（支持 OpenAI Vision 格式） */
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}>;

export interface ModelCallConfig {
  id: string;
  provider: string;
  apiEndpoint?: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  /** 模型能力标签（如 ['reasoning', 'multimodal']） */
  capabilities?: string[];
}

/** Tool 定义（OpenAI 格式） */
export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Tool Call（AI 返回的工具调用请求） */
export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

/** Tool Result（工具执行结果） */
export interface ToolResult {
  tool_call_id: string;
  role: 'tool';
  content: string;
}

/** AI 响应（可能包含 tool_calls） */
export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
}

/** AI API 错误分类 */
export class AIAPIError extends Error {
  constructor(
    message: string,
    public readonly category: 'auth' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'unknown',
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'AIAPIError';
  }
}

/** 重试配置 */
const RETRY_CONFIG = {
  maxRetries: 2,
  baseDelayMs: 1000,
  maxDelayMs: 8000,
};

/** 判断错误是否可重试 */
function isRetryableError(error: unknown): boolean {
  if (error instanceof AIAPIError) {
    return ['network', 'timeout', 'server', 'rate_limit'].includes(error.category);
  }
  if (error instanceof TypeError) {
    // 本地模型连接失败（ECONNREFUSED）不应重试
    const msg = error.message || '';
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
      return false;
    }
    return true;
  }
  return false;
}

/** 指数退延计算 */
function calculateDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt),
    RETRY_CONFIG.maxDelayMs,
  );
  return delay * (0.75 + Math.random() * 0.5);
}

/** 等待指定毫秒 */
function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** 根据 HTTP 状态码分类错误 */
function classifyError(statusCode: number, responseBody: string): AIAPIError['category'] {
  if (statusCode === 401 || statusCode === 403) return 'auth';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode >= 500) return 'server';
  if (statusCode >= 400) return 'unknown';
  return 'unknown';
}

// ===================== OpenAI 兼容格式（含 Tool Calling）====================

/**
 * OpenAI 兼容格式流式调用（支持 Tool Calling）
 *
 * 当传入 tools 参数时：
 * 1. 在请求体中包含 tools 定义
 * 2. 流式解析时检测 tool_calls 事件
 * 3. 通过 onToolCall 回调通知调用方
 * 4. 不通过 onChunk 输出 tool_calls 内容（避免 UI 显示工具调用 JSON）
 */
export async function callOpenAICompatibleStream(
  apiEndpoint: string,
  apiKey: string | undefined,
  modelId: string,
  messages: Array<{ role: string; content: MessageContent }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
): Promise<AIResponse> {
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = 'auto';
  }

  // reasoning_effort 支持（推理模型）
  const supportsReasoning = /deepseek|reasoner|o3|o4|r1/i.test(modelId);
  if (reasoningEffort && supportsReasoning) {
    body.reasoning_effort = reasoningEffort;
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

  // Tool Calling 状态追踪
  const toolCalls: ToolCall[] = [];
  let currentToolCall: ToolCall | null = null;

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

          // 解析 reasoning_content（DeepSeek-R1 等推理模型）和 reasoning（OpenAI o3/o4-mini）
          const reasoningDelta = delta?.reasoning_content || delta?.reasoning;
          if (reasoningDelta) {
            reasoningContent += reasoningDelta;
            if (onThinking) onThinking(reasoningDelta);
          }

          // 解析 tool_calls
          const toolCallsDelta = delta?.tool_calls;
          if (toolCallsDelta && Array.isArray(toolCallsDelta)) {
            for (const tc of toolCallsDelta) {
              const index = tc.index ?? 0;
              // 初始化新的 tool call
              if (!toolCalls[index]) {
                toolCalls[index] = {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                };
              }
              // 累积 function name
              if (tc.function?.name) {
                toolCalls[index].function.name += tc.function.name;
              }
              // 累积 function arguments
              if (tc.function?.arguments) {
                toolCalls[index].function.arguments += tc.function.arguments;
              }
              // 累积 id
              if (tc.id) {
                toolCalls[index].id = tc.id;
              }
            }
          }

          // 普通内容 delta
          const contentDelta = delta?.content;
          if (contentDelta) {
            fullContent += contentDelta;
            onChunk(contentDelta);
          }

          if (parsed.error) {
            throw new AIAPIError(
              `流中收到错误: ${JSON.stringify(parsed.error)}`,
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

  // 流结束后，如果有完整的 tool calls，通过回调通知
  if (onToolCall) {
    for (const tc of toolCalls) {
      if (tc.function.name) {
        onToolCall(tc);
      }
    }
  }

  return {
    content: fullContent,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    reasoningContent: reasoningContent || undefined,
  };
}

// ===================== Anthropic 原生格式 =====================

/** Anthropic 格式的 content block（v1.9.3: 支持 image 多模态） */
interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking' | 'image';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  thinking?: string;
  source?: {
    type: 'base64' | 'url';
    media_type?: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data?: string;
    url?: string;
  };
}

/** Anthropic 消息格式（v1.9.3: 支持多模态 content 数组） */
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentBlock[];
}

/** Anthropic tool 定义格式 */
interface AnthropicToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** OpenAI Vision 格式的 content 项 */
interface OpenAIVisionContent {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}

/**
 * 将 OpenAI 格式的消息转换为 Anthropic 格式
 *
 * 转换规则：
 * - role: 'system' → 提取为 systemPrompt 返回
 * - role: 'user' → 保持 role: 'user'（支持多模态 content 数组）
 * - role: 'assistant' → 保持 role: 'assistant'（含 tool_calls 时转为 content 数组）
 * - role: 'tool' → 转为 role: 'user'，content 为 tool_result 数组
 *
 * v1.9.3: 新增多模态支持 — OpenAI image_url 格式转为 Anthropic image 格式
 */
function convertMessagesToAnthropic(
  messages: Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
): { systemPrompt: string; anthropicMessages: AnthropicMessage[] } {
  let systemPrompt = '';
  const anthropicMessages: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      continue;
    }

    if (msg.role === 'user') {
      // v1.9.3: 支持多模态 content 数组（OpenAI Vision 格式 → Anthropic 格式）
      if (Array.isArray(msg.content)) {
        const contentBlocks: AnthropicContentBlock[] = [];
        for (const part of msg.content) {
          if (part.type === 'text' && part.text) {
            contentBlocks.push({ type: 'text', text: part.text });
          } else if (part.type === 'image_url' && part.image_url?.url) {
            // OpenAI image_url → Anthropic image 格式
            const url = part.image_url.url;
            if (url.startsWith('data:')) {
              // data URL: data:image/png;base64,xxx
              const match = url.match(/^data:([^;]+);base64,(.+)$/);
              if (match) {
                contentBlocks.push({
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
                    data: match[2],
                  },
                });
              }
            } else {
              // 普通 URL
              contentBlocks.push({
                type: 'image',
                source: { type: 'url', url },
              } as AnthropicContentBlock);
            }
          }
        }
        anthropicMessages.push({ role: 'user', content: contentBlocks });
      } else {
        anthropicMessages.push({ role: 'user', content: msg.content });
      }
      continue;
    }

    if (msg.role === 'assistant') {
      // 如果 assistant 消息包含 tool_calls，需要转为 content 数组格式
      if (msg.tool_calls && msg.tool_calls.length > 0) {
        const contentBlocks: AnthropicContentBlock[] = [];
        if (msg.content) {
          contentBlocks.push({ type: 'text', text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
        }
        for (const tc of msg.tool_calls) {
          contentBlocks.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || '{}'),
          });
        }
        anthropicMessages.push({ role: 'assistant', content: contentBlocks });
      } else {
        anthropicMessages.push({ role: 'assistant', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
      }
      continue;
    }

    if (msg.role === 'tool') {
      // tool result 转为 user 消息的 tool_result content 数组
      anthropicMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: msg.tool_call_id || '',
            content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
          },
        ],
      });
      continue;
    }

    // 其他未知 role，按原样传递（Anthropic 会报错，便于调试）
    anthropicMessages.push({ role: msg.role as 'user' | 'assistant', content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content) });
  }

  return { systemPrompt, anthropicMessages };
}

/**
 * 将 OpenAI 格式的 ToolDefinition 转换为 Anthropic 格式
 */
function convertToolsToAnthropic(tools: ToolDefinition[]): AnthropicToolDefinition[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }));
}

/**
 * Anthropic 原生格式流式调用（Claude 系列）
 *
 * v2.0.0: 新增 Tool Calling 支持 — 支持 tools 参数传递和 tool_use 响应解析
 */
export async function callAnthropicStream(
  apiEndpoint: string,
  apiKey: string | undefined,
  modelId: string,
  messages: Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
): Promise<AIResponse> {
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/messages')) {
    endpoint += '/messages';
  }

  const { systemPrompt, anthropicMessages } = convertMessagesToAnthropic(messages);

  const body: Record<string, unknown> = {
    model: modelId,
    messages: anthropicMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }
  if (tools && tools.length > 0) {
    body.tools = convertToolsToAnthropic(tools);
    body.tool_choice = { type: 'auto' };
  }

  // Anthropic thinking budget（推理模型）
  // 仅对明确支持 extended thinking 的模型发送 thinking 参数
  // Claude 3.7+, Claude 4+ 支持；旧版 Opus/Sonnet 不支持
  const supportsThinking = /claude.*(3[-.]7|4|sonnet[-.]4)/i.test(modelId);
  if (reasoningEffort && supportsThinking) {
    const budgetMap: Record<string, number> = { high: 10000, max: 32000 };
    const budgetTokens = budgetMap[reasoningEffort] || 10000;
    body.thinking = { type: 'enabled', budget_tokens: budgetTokens };
    // Anthropic thinking 模式不支持 temperature，移除
    delete body.temperature;
  } else if (reasoningEffort && !supportsThinking) {
    console.warn(`[AIClient] 模型 ${modelId} 可能不支持 extended thinking，跳过 thinking 参数`);
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
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

  // Tool Calling 状态追踪（Anthropic 格式）
  const toolCalls: ToolCall[] = [];
  let currentToolCall: ToolCall | null = null;
  let currentToolInput = '';

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
            // 检测 tool_use 块开始
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
            // 累积 tool_use 的 input JSON
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
            // tool_use 块结束，构造完整 ToolCall
            if (currentToolCall) {
              currentToolCall.function.arguments = currentToolInput;
              toolCalls.push(currentToolCall);
              // 立即通过回调通知调用方
              if (onToolCall) {
                onToolCall(currentToolCall);
              }
              currentToolCall = null;
              currentToolInput = '';
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
  };
}

// ===================== 统一调用入口（含重试）====================

/**
 * 直接调用 AI 模型 API（自动选择 OpenAI 兼容格式或 Anthropic 原生格式）
 * 支持流式 SSE 响应，含自动重试机制
 *
 * v1.9.0: 新增 tools 参数支持 Tool Calling
 */
export async function callAIModelStream(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: MessageContent; tool_calls?: ToolCall[]; tool_call_id?: string }>,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
  onThinking?: (text: string) => void,
  tools?: ToolDefinition[],
  onToolCall?: (toolCall: ToolCall) => void,
  reasoningEffort?: string,
): Promise<AIResponse> {
  const apiKey = modelConfig.apiKey;
  const apiEndpoint = modelConfig.apiEndpoint || '';
  const modelId = modelConfig.id;
  const temperature = modelConfig.temperature ?? 0.7;
  const maxTokens = modelConfig.maxTokens || 4096;
  const provider = modelConfig.provider;

  if (!apiKey && !isLocalModel(modelConfig)) {
    throw new AIAPIError(
      `模型 ${modelId} 未配置 API Key，请在模型管理中设置密钥`,
      'auth',
    );
  }
  if (!apiEndpoint) {
    throw new AIAPIError(
      `模型 ${modelId} 未配置 API 端点`,
      'unknown',
    );
  }
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (signal?.aborted) {
      throw new AIAPIError('请求已取消', 'unknown');
    }

    try {
      if (provider === 'anthropic') {
        return await callAnthropicStream(
          apiEndpoint, apiKey, modelId,
          messages as Array<{ role: string; content: string | OpenAIVisionContent[]; tool_calls?: ToolCall[]; tool_call_id?: string }>,
          temperature, maxTokens, onChunk, signal,
          onThinking, tools, onToolCall, reasoningEffort,
        );
      }
      return await callOpenAICompatibleStream(
        apiEndpoint, apiKey, modelId,
        messages as Array<{ role: string; content: string | OpenAIVisionContent[] }>,
        temperature, maxTokens, onChunk, signal,
        onThinking, tools, onToolCall, reasoningEffort,
      );
    } catch (error) {
      lastError = error;
      if (signal?.aborted) throw error;
      if (error instanceof AIAPIError && error.category === 'auth') {
        throw error;
      }
      if (attempt >= RETRY_CONFIG.maxRetries) break;
      if (!isRetryableError(error)) break;

      const delay = calculateDelay(attempt);
      console.log(`[AIClient] 请求失败，${delay.toFixed(0)}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * 非流式调用 AI 模型 API（用于技能链等不需要流式的场景）
 * 返回完整的文本响应
 */
export async function callAIModel(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: MessageContent }>,
  signal?: AbortSignal,
): Promise<string> {
  const response = await callAIModelStream(modelConfig, messages, () => {}, signal);
  return response.content;
}
