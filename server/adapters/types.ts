/**
 * AI API 适配器类型定义
 *
 * 统一的适配器接口，支持多种 API 格式：
 * - openai-chat: OpenAI Chat Completions API
 * - openai-completions: OpenAI Completions API (legacy)
 * - anthropic-messages: Anthropic Messages API
 * - google-generative-ai: Google Generative AI API
 * - ... 可扩展
 */

import type { MessageContent, ToolDefinition, ToolCall, AIResponse } from '../aiClient.js';

/** 支持的 API 类型 */
export type ModelApiType =
  | 'openai-chat'
  | 'openai-completions'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'qwen-chat'
  | 'moonshot-chat';

/** 适配器通用配置 */
export interface AdapterConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  authMode?: 'api-key' | 'aws-sdk' | 'oauth' | 'token' | 'none';
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  contextWindow?: number;
  capabilities?: string[];
  thinkingLevel?: string;
  signal?: AbortSignal;
  /** Provider 兼容性配置 */
  compat?: AdapterCompatConfig;
  /** 媒体输入配置 */
  mediaInput?: AdapterMediaInputConfig;
  /** 强制工具选择（按请求覆盖）。默认 undefined 即 'auto'。
   *  用于确保特定意图（如“生成文件”）必定调用指定工具，避免模型退化成正文输出。 */
  toolChoice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
}

/** Provider 兼容性配置 */
export interface AdapterCompatConfig {
  /** 是否支持 streaming */
  supportsStreaming?: boolean;
  /** 是否支持 tool calling */
  supportsToolCalls?: boolean;
  /** 是否支持 reasoning/thinking */
  supportsReasoning?: boolean;
  /** reasoning 字段名（不同 provider 可能不同） */
  reasoningField?: string;
  /** 是否需要在请求头中指定 API 版本 */
  apiVersion?: string;
  /** 自定义请求头 */
  extraHeaders?: Record<string, string>;
  /** 自定义请求体参数 */
  extraBodyParams?: Record<string, unknown>;
  /** 消息角色映射 */
  roleMap?: Record<string, string>;
  /** 是否支持 system 消息 */
  supportsSystemMessage?: boolean;
  /** 不支持 system 消息时的处理方式：合并到首条 user 消息 / 忽略 */
  systemMessageFallback?: 'merge-to-first-user' | 'ignore';
  /** 最大图片数量限制 */
  maxImages?: number;
  /** 是否支持 vision */
  supportsVision?: boolean;
  /** 思考模式配置 */
  thinking?: {
    /** 思考参数字段名 */
    paramField?: string;
    /** 思考级别映射 */
    levelMap?: Record<string, string>;
    /** 是否使用 thinking budget (Anthropic 风格) */
    useBudget?: boolean;
    /** thinking budget 占 maxTokens 的比例 */
    budgetRatio?: number;
  };
  /** Prompt Cache 配置 */
  supportsPromptCache?: boolean;
  /** 缓存断点位置 */
  cacheBreakpoints?: ('system' | 'tools' | 'last-user')[];
}

/** 媒体输入配置 */
export interface AdapterMediaInputConfig {
  /** 支持的输入类型 */
  supportedInputs?: Array<'text' | 'image' | 'video' | 'audio'>;
  /** 图片配置 */
  image?: {
    /** 最大文件大小（字节） */
    maxFileSize?: number;
    /** 支持的格式 */
    formats?: string[];
    /** 最大像素数（宽 x 高） */
    maxPixels?: number;
    /** 最大宽度 */
    maxWidth?: number;
    /** 最大高度 */
    maxHeight?: number;
    /** 是否支持 detail 参数 */
    supportsDetail?: boolean;
    /** detail 级别映射 */
    detailLevels?: Array<'auto' | 'low' | 'high'>;
  };
  /** 视频配置 */
  video?: {
    maxFileSize?: number;
    formats?: string[];
    maxDurationSeconds?: number;
  };
  /** 音频配置 */
  audio?: {
    maxFileSize?: number;
    formats?: string[];
    maxDurationSeconds?: number;
  };
}

/** 流式调用回调 */
export interface StreamCallbacks {
  onChunk: (text: string) => void;
  onThinking?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onUsage?: (usage: AIResponse['usage']) => void;
}

/** AI API 适配器接口 */
export interface IAiApiAdapter {
  /** 适配器类型 */
  readonly apiType: ModelApiType;

  /**
   * 流式调用 AI 模型
   */
  callStream(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    callbacks: StreamCallbacks,
    tools?: ToolDefinition[],
  ): Promise<AIResponse>;

  /**
   * 非流式调用 AI 模型
   */
  call(
    config: AdapterConfig,
    messages: Array<{ role: string; content: MessageContent }>,
    tools?: ToolDefinition[],
  ): Promise<AIResponse>;
}

/** 适配器工厂函数类型 */
export type AdapterFactory = () => IAiApiAdapter;
