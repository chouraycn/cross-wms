/**
 * OpenAI 扩展共享工具
 *
 * 提供 Base URL 解析、通用类型定义和工具函数。
 * 移植自 openclaw/extensions/openai/shared.ts 和 openclaw/extensions/openai/base-url.ts。
 */

// ===================== 常量 =====================

/** OpenAI API 默认 Base URL */
export const OPENAI_API_BASE_URL = 'https://api.openai.com/v1';

/** OpenAI Chat Completions 默认模型 */
export const OPENAI_DEFAULT_MODEL = 'gpt-5.4';

/** OpenAI Responses API 默认模型 */
export const OPENAI_DEFAULT_RESPONSES_MODEL = 'gpt-5.4';

// ===================== 类型定义 =====================

/** 消息内容类型 */
export type MessageContent = string | Array<{
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string; detail?: 'auto' | 'low' | 'high' };
}>;

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
    thinkingTokens?: number;
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
export interface OpenAICallConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  authMode?: 'api-key' | 'bearer' | 'token' | 'oauth' | 'none';
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  thinkingLevel?: string;
  signal?: AbortSignal;
  /** Provider 兼容性配置 */
  compat?: OpenAICompatConfig;
  /** 媒体输入配置 */
  mediaInput?: {
    image?: {
      maxFileSize?: number;
    };
  };
  /** 工具选择 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/** Provider 兼容性配置 */
export interface OpenAICompatConfig {
  /** 是否支持 tool calling */
  supportsToolCalls?: boolean;
  /** 是否支持 reasoning/thinking */
  supportsReasoning?: boolean;
  /** API 版本（如 Azure OpenAI） */
  apiVersion?: string;
  /** 自定义请求头 */
  extraHeaders?: Record<string, string>;
  /** 自定义请求体参数 */
  extraBodyParams?: Record<string, unknown>;
  /** 消息角色映射 */
  roleMap?: Record<string, string>;
  /** 是否支持 system 消息 */
  supportsSystemMessage?: boolean;
  /** 不支持 system 消息时的处理方式 */
  systemMessageFallback?: 'merge-to-first-user' | 'ignore';
  /** 最大图片数量限制 */
  maxImages?: number;
  /** 思考模式配置 */
  thinking?: {
    /** 思考参数字段名 */
    paramField?: string;
    /** 思考级别映射 */
    levelMap?: Record<string, string>;
  };
  /** Prompt Cache 配置 */
  supportsPromptCache?: boolean;
}

/** OpenAI API 错误 */
export class OpenAIAPIError extends Error {
  category: string;
  status?: number;
  body?: string;

  constructor(message: string, category: string, status?: number, body?: string) {
    super(message);
    this.name = 'OpenAIAPIError';
    this.category = category;
    this.status = status;
    this.body = body;
  }
}

// ===================== 工具函数 =====================

/**
 * 从配置解析 OpenAI base URL
 */
export function resolveConfiguredOpenAIBaseUrl(config?: Record<string, unknown>): string {
  if (!config) return OPENAI_API_BASE_URL;
  const providers = config.models as Record<string, unknown> | undefined;
  const openaiConfig = providers?.openai as Record<string, unknown> | undefined;
  if (typeof openaiConfig?.baseUrl === 'string' && openaiConfig.baseUrl.trim()) {
    return openaiConfig.baseUrl.trim();
  }
  return OPENAI_API_BASE_URL;
}

/**
 * 判断思考级别是否有效（非 off）
 */
export function isThinkingEnabled(level?: string | null): boolean {
  if (!level) return false;
  const normalized = level.toLowerCase().trim();
  return normalized !== 'off' && normalized !== 'disable' && normalized !== '0' && normalized !== 'false';
}

/**
 * 规范化思考级别为 reasoning_effort 值
 */
const THINKING_LEVEL_TO_EFFORT: Record<string, string> = {
  minimal: 'low',
  low: 'low',
  medium: 'medium',
  adaptive: 'medium',
  high: 'high',
  xhigh: 'high',
  max: 'high',
};

export function normalizeThinkingEffort(level?: string | null): string | null {
  if (!isThinkingEnabled(level)) return null;
  const normalized = level!.toLowerCase().trim();
  return THINKING_LEVEL_TO_EFFORT[normalized] || 'medium';
}

/**
 * 应用角色映射
 */
export function applyRoleMapping(
  messages: ChatMessage[],
  roleMap?: Record<string, string>,
): ChatMessage[] {
  if (!roleMap) return messages;
  return messages.map(msg => ({
    ...msg,
    role: roleMap[msg.role] || msg.role,
  }));
}

/**
 * 处理 system 消息回退
 */
export function handleSystemMessageFallback(
  messages: ChatMessage[],
  fallback?: 'merge-to-first-user' | 'ignore',
): ChatMessage[] {
  if (!fallback) return messages;

  const systemMsgs = messages.filter(m => m.role === 'system');
  if (systemMsgs.length === 0) return messages;

  if (fallback === 'ignore') {
    return messages.filter(m => m.role !== 'system');
  }

  // merge-to-first-user
  const systemContent = systemMsgs
    .map(m => typeof m.content === 'string' ? m.content : m.content.map(c => 'text' in c ? c.text : '').join('\n'))
    .join('\n\n');

  const otherMsgs = messages.filter(m => m.role !== 'system');
  const firstUserIdx = otherMsgs.findIndex(m => m.role === 'user');

  if (firstUserIdx === -1) {
    otherMsgs.unshift({ role: 'user', content: systemContent });
  } else {
    const firstUser = otherMsgs[firstUserIdx];
    if (typeof firstUser.content === 'string') {
      otherMsgs[firstUserIdx] = {
        ...firstUser,
        content: systemContent + '\n\n' + firstUser.content,
      };
    } else {
      const newContent = [...firstUser.content];
      const firstTextIdx = newContent.findIndex(c => c.type === 'text');
      if (firstTextIdx !== -1) {
        newContent[firstTextIdx] = {
          ...newContent[firstTextIdx],
          text: systemContent + '\n\n' + (newContent[firstTextIdx] as { type: 'text'; text?: string }).text,
        };
      } else {
        newContent.unshift({ type: 'text', text: systemContent });
      }
      otherMsgs[firstUserIdx] = { ...firstUser, content: newContent };
    }
  }

  return otherMsgs;
}

/**
 * 判断是否为本地模型端点
 */
export function isLocalEndpoint(apiEndpoint: string): boolean {
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|192\.168\.|10\.\d+\.|172\.(1[6-9]|2\d|3[01])\.:11434/.test(apiEndpoint);
}

/**
 * 错误分类
 */
export function classifyError(status: number, _body: string): string {
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server';
  if (status === 400) return 'validation';
  return 'unknown';
}

/**
 * 将 base64 图片转为 data URL
 */
export function toOpenAIDataUrl(buffer: Buffer, mimeType: string): string {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
