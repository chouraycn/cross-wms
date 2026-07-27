
/**
 * DeepSeek 扩展共享工具
 *
 * 提供 Base URL 解析、通用类型定义和工具函数。
 * DeepSeek API 兼容 OpenAI Chat Completions 格式。
 */

// ===================== 常量 =====================

/** DeepSeek API 默认 Base URL */
export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com/v1';

/** DeepSeek 默认模型 */
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';

// ===================== 类型定义 =====================

/** 消息内容类型 */
export type MessageContent = string | Array&lt;{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}&gt;;

/** 通用聊天消息 */
export interface ChatMessage {
  role: string;
  content: MessageContent;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  reasoningSignature?: string;
  thinkingSignature?: string;
}

/** Tool 定义 */
export interface ToolDefinition {
  function: {
    name: string;
    description: string;
    parameters: Record&lt;string, unknown&gt;;
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
    thinkingTokens?: number;
    totalTokens?: number;
  };
}

/** 流式回调 */
export interface StreamCallbacks {
  onChunk: (text: string) =&gt; void;
  onThinking?: (text: string) =&gt; void;
  onToolCall?: (toolCall: ToolCall) =&gt; void;
  onUsage?: (usage: AIResponse['usage']) =&gt; void;
}

/** API 调用配置 */
export interface DeepSeekCallConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  authMode?: 'api-key' | 'bearer' | 'token' | 'none';
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  thinkingLevel?: string;
  signal?: AbortSignal;
  /** Provider 兼容性配置 */
  compat?: DeepSeekCompatConfig;
  /** 工具选择 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/** DeepSeek 兼容性配置 */
export interface DeepSeekCompatConfig {
  supportsSystemMessage?: boolean;
  systemMessageFallback?: 'user' | 'none';
  roleMap?: Record&lt;string, string&gt;;
  maxImages?: number;
  supportsUsageInStreaming?: boolean;
  supportsReasoningEffort?: boolean;
  maxTokensField?: string;
  extraHeaders?: Record&lt;string, string&gt;;
  extraBodyParams?: Record&lt;string, unknown&gt;;
  apiVersion?: string;
}

/** DeepSeek API 错误 */
export class DeepSeekAPIError extends Error {
  category: string;
  statusCode?: number;
  responseText?: string;

  constructor(message: string, category: string, statusCode?: number, responseText?: string) {
    super(message);
    this.name = 'DeepSeekAPIError';
    this.category = category;
    this.statusCode = statusCode;
    this.responseText = responseText;
  }
}

// ===================== 工具函数 =====================

/**
 * 解析配置的 DeepSeek Base URL
 */
export function resolveConfiguredDeepSeekBaseUrl(config: Record&lt;string, unknown&gt;): string {
  const baseUrl = config.baseUrl as string | undefined;
  return baseUrl || DEEPSEEK_API_BASE_URL;
}

/**
 * 判断是否启用思考模式
 */
export function isThinkingEnabled(thinkingLevel?: string): boolean {
  if (!thinkingLevel) return false;
  const lower = thinkingLevel.toLowerCase();
  return lower !== 'off' &amp;&amp; lower !== 'disabled' &amp;&amp; lower !== 'none';
}

/**
 * 规范化思考级别
 */
export function normalizeThinkingEffort(thinkingLevel?: string): string | undefined {
  if (!thinkingLevel) return undefined;
  const lower = thinkingLevel.toLowerCase();
  if (lower === 'off' || lower === 'disabled' || lower === 'none') return undefined;
  if (lower === 'minimal' || lower === 'low') return 'low';
  if (lower === 'medium' || lower === 'default') return 'medium';
  if (lower === 'high') return 'high';
  if (lower === 'xhigh' || lower === 'very_high') return 'high';
  if (lower === 'max') return 'high';
  return lower;
}

/**
 * 应用角色映射
 */
export function applyRoleMapping(
  messages: ChatMessage[],
  roleMap?: Record&lt;string, string&gt;,
): ChatMessage[] {
  if (!roleMap || Object.keys(roleMap).length === 0) return messages;
  return messages.map(msg =&gt; {
    const mappedRole = roleMap[msg.role];
    if (mappedRole) {
      return { ...msg, role: mappedRole };
    }
    return msg;
  });
}

/**
 * 处理 System 消息回退
 */
export function handleSystemMessageFallback(
  messages: ChatMessage[],
  fallback: 'user' | 'none',
): ChatMessage[] {
  if (fallback === 'none') return messages;
  const result: ChatMessage[] = [];
  let systemAccumulated = '';

  for (const msg of messages) {
    if (msg.role === 'system') {
      const content = typeof msg.content === 'string' ? msg.content : '';
      if (content) {
        systemAccumulated += (systemAccumulated ? '\n\n' : '') + content;
      }
    } else {
      result.push(msg);
    }
  }

  if (systemAccumulated &amp;&amp; result.length &gt; 0) {
    const firstMsg = result[0];
    const firstContent = typeof firstMsg.content === 'string' ? firstMsg.content : '';
    result[0] = {
      ...firstMsg,
      content: systemAccumulated + '\n\n' + firstContent,
    };
  }

  return result;
}

/**
 * 判断是否为本地端点
 */
export function isLocalEndpoint(endpoint: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(endpoint);
}

/**
 * 分类错误
 */
export function classifyError(statusCode: number, errorText: string): string {
  if (statusCode === 401 || statusCode === 403) {
    return 'auth';
  }
  if (statusCode === 404) {
    return 'not-found';
  }
  if (statusCode === 429) {
    return 'rate-limit';
  }
  if (statusCode &gt;= 500) {
    return 'server';
  }
  if (/context.*length|too.*long|token.*limit|max.*tokens/i.test(errorText)) {
    return 'context-overflow';
  }
  return 'unknown';
}

/**
 * DeepSeek V4 模型 ID
 */
const DEEPSEEK_V4_MODEL_IDS = new Set(['deepseek-v4-flash', 'deepseek-v4-pro']);

/**
 * 判断是否为 DeepSeek V4 模型
 */
export function isDeepSeekV4ModelId(modelId: string): boolean {
  return DEEPSEEK_V4_MODEL_IDS.has(modelId.toLowerCase());
}
