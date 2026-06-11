/**
 * AI 模型 API 客户端
 *
 * 直接调用 AI 模型 API（OpenAI 兼容格式 / Anthropic 原生格式），
 * 不依赖任何第三方 Agent SDK。
 *
 * 支持流式 SSE 响应和非流式调用，含自动重试、错误分类、超时控制。
 */

// ===================== 类型定义 =====================

import { isLocalModel } from './modelsStore.js';

export interface ModelCallConfig {
  id: string;
  provider: string;
  apiEndpoint?: string;
  apiKey?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
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
    // fetch 网络错误（如 ECONNREFUSED、ENOTFOUND）
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
  // 添加随机抖动（±25%）
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

// ===================== OpenAI 兼容格式 =====================

/**
 * OpenAI 兼容格式流式调用（适用于 OpenAI、DeepSeek、Qwen、Google、Ollama 等）
 */
export async function callOpenAICompatibleStream(
  apiEndpoint: string,
  apiKey: string,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // 确保 endpoint 以 /chat/completions 结尾
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint += '/chat/completions';
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Ollama 等本地模型通常不需要 API Key，仅在提供时添加
  if (apiKey && apiKey.trim()) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: modelId,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
    signal,
  });

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
  let buffer = '';

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

        // 处理 SSE 格式：以 "data: " 开头
        if (!trimmed.startsWith('data: ')) {
          // 某些服务商可能发送非标准行，尝试解析整行
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
          // OpenAI 标准格式
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(delta);
          }
          // 某些服务商的错误信息嵌在流中
          if (parsed.error) {
            throw new AIAPIError(
              `流中收到错误: ${JSON.stringify(parsed.error)}`,
              'server',
            );
          }
        } catch (e) {
          if (e instanceof AIAPIError) throw e;
          // 忽略解析错误，继续处理下一行
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

// ===================== Anthropic 原生格式 =====================

/**
 * Anthropic 原生格式流式调用（Claude 系列）
 */
export async function callAnthropicStream(
  apiEndpoint: string,
  apiKey: string,
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  temperature: number,
  maxTokens: number,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  // Anthropic API 端点
  let endpoint = apiEndpoint.replace(/\/+$/, '');
  if (!endpoint.endsWith('/messages')) {
    endpoint += '/messages';
  }

  // 转换消息格式：Anthropic 需要 system 单独传递
  let systemPrompt = '';
  const anthropicMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === 'system') {
      systemPrompt = msg.content;
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

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

  const response = await fetch(endpoint, {
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
  let buffer = '';

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
          if (parsed.type === 'content_block_delta') {
            const text = parsed.delta?.text;
            if (text) {
              fullContent += text;
              onChunk(text);
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
          // 忽略解析错误
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullContent;
}

// ===================== 统一调用入口（含重试） =====================

/**
 * 直接调用 AI 模型 API（自动选择 OpenAI 兼容格式或 Anthropic 原生格式）
 * 支持流式 SSE 响应，含自动重试机制
 */
export async function callAIModelStream(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: string }>,
  onChunk: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const apiKey = modelConfig.apiKey;
  const apiEndpoint = modelConfig.apiEndpoint || '';
  const modelId = modelConfig.id;
  const temperature = modelConfig.temperature ?? 0.7;
  const maxTokens = modelConfig.maxTokens || 4096;
  const provider = modelConfig.provider;

  // 本地部署模型不需要 API Key
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
    // 检查是否已被取消
    if (signal?.aborted) {
      throw new AIAPIError('请求已取消', 'unknown');
    }

    try {
      if (provider === 'anthropic') {
        return await callAnthropicStream(
          apiEndpoint, apiKey, modelId, messages,
          temperature, maxTokens, onChunk, signal,
        );
      }
      return await callOpenAICompatibleStream(
        apiEndpoint, apiKey, modelId, messages,
        temperature, maxTokens, onChunk, signal,
      );
    } catch (error) {
      lastError = error;

      // 已被取消，不重试
      if (signal?.aborted) throw error;

      // 认证错误不重试
      if (error instanceof AIAPIError && error.category === 'auth') {
        throw error;
      }

      // 最后一轮不再重试
      if (attempt >= RETRY_CONFIG.maxRetries) break;

      // 不可重试的错误
      if (!isRetryableError(error)) break;

      const delay = calculateDelay(attempt);
      console.log(`[AIClient] 请求失败，${delay.toFixed(0)}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})...`);
      await sleep(delay);
    }
  }

  // 所有重试都失败了
  throw lastError;
}

/**
 * 非流式调用 AI 模型 API（用于技能链等不需要流式的场景）
 * 返回完整的文本响应
 */
export async function callAIModel(
  modelConfig: ModelCallConfig,
  messages: Array<{ role: string; content: string }>,
  signal?: AbortSignal,
): Promise<string> {
  return callAIModelStream(modelConfig, messages, () => {}, signal);
}
