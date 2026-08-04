/**
 * AI 客户端核心类型与错误工具
 *
 * 从 aiClient.ts 中提取的自包含类型/接口与错误类、错误分类函数。
 * 这些符号被 aiClient.ts 与 server/adapters/* 大量共用；
 * 集中到独立文件可打破 `aiClient.ts <-> adapters/registry.ts <-> *Adapter.ts`
 * 之间的循环依赖（适配器不再需要 import aiClient.ts）。
 *
 * 注意：本文件不依赖 aiClient.ts 或 adapters，请保持零业务依赖。
 */

/** 消息内容类型（支持 OpenAI Vision 格式） */
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}>;

/** Tool 定义（OpenAI 格式） */
export interface ToolDefinition {
  type: 'function';
  /** 工具名称（便捷访问，等价于 function.name） */
  name?: string;
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
    /** Anthropic cache_control 标记 */
    cache_control?: { type: 'ephemeral' };
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

/** AI 响应（可能包含 tool_calls） */
export interface AIResponse {
  content: string;
  toolCalls?: ToolCall[];
  reasoningContent?: string;
  /** thinking 加密签名（Anthropic thinking content block 提取，可回传 API） */
  thinkingSignature?: string;
  /** 安全脱敏标记（redacted_thinking 块为 true） */
  redacted?: boolean;
  // v2.2.0: token 使用统计
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    thinkingTokens?: number;
    totalTokens?: number;
  };
}

/** AI API 错误分类 */
export class AIAPIError extends Error {
  constructor(
    message: string,
    public readonly category: 'auth' | 'rate_limit' | 'network' | 'timeout' | 'server' | 'model_not_supported' | 'context_overflow' | 'unknown',
    public readonly statusCode?: number,
    public readonly responseBody?: string,
  ) {
    super(message);
    this.name = 'AIAPIError';
  }
}

/** 根据 HTTP 状态码 + 响应体分类错误 */
export function classifyError(statusCode: number, responseBody: string): AIAPIError['category'] {
  if (statusCode === 401 || statusCode === 403) return 'auth';
  if (statusCode === 429) return 'rate_limit';
  if (statusCode === 402) {
    // v1.5.208: 402 Payment Required — 余额不足，应触发降级而非报错
    const body = responseBody.toLowerCase();
    if (body.includes('insufficient balance') || body.includes('billing') || body.includes('payment') || body.includes('quota')) {
      return 'model_not_supported';
    }
    return 'unknown';
  }
  if (statusCode >= 500) return 'server';
  if (statusCode >= 400) {
    // v1.5.116: 识别模型不支持错误
    const body = responseBody.toLowerCase();
    if (body.includes('model_not_supported') || body.includes('invalid_model') || body.includes('model not found')) {
      return 'model_not_supported';
    }
    // v2.x: 识别上下文溢出错误
    if (
      body.includes('context_length_exceeded') ||
      body.includes('context overflow') ||
      body.includes('maximum context length') ||
      body.includes('prompt is too long') ||
      body.includes('context_window') ||
      body.includes('context window') ||
      body.includes('token limit exceeded') ||
      body.includes('content_length_exceeded') ||
      body.includes('request too large')
    ) {
      return 'context_overflow';
    }
    return 'unknown';
  }
  return 'unknown';
}
