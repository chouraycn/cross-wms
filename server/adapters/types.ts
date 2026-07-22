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
  | 'openai-responses'
  | 'openai-completions'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'qwen-chat'
  | 'moonshot-chat'
  | 'azure-openai'
  | 'groq-chat'
  | 'xai-chat'
  | 'vllm-chat'
  | 'zai-chat'
  | 'deepseek-chat'
  | 'qianfan-chat'
  | 'perplexity-chat'
  | 'claude-chat'
  | 'cohere-chat'
  | 'mistral-chat'
  | 'ollama-chat'
  | 'openrouter-chat'
  | 'arcee-chat'
  | 'cerebras-chat'
  | 'chutes-chat'
  | 'huggingface-chat'
  | 'lmstudio-chat'
  | 'novita-chat'
  | 'byteplus-chat'
  | 'kimi-coding-chat'
  | 'llama-cpp-chat'
  | 'nvidia-chat'
  | 'brave-chat'
  | 'exa-chat'
  | 'firecrawl-chat'
  | 'deepgram-stt'
  | 'fal-generate'
  | 'together-chat'
  | 'fireworks-chat'
  | 'volcengine-chat'
  | 'tencent-chat'
  | 'stepfun-chat'
  | 'venice-chat'
  | 'sglang-chat'
  | 'opencode-chat'
  | 'minimax-chat'
  | 'codex-chat'
  | 'clickclack-chat'
  | 'gradium-chat'
  | 'gmi-chat'
  | 'parallel-chat'
  | 'kilocode-chat'
  | 'opencode-go-chat'
  | 'zalouser-chat'
  | 'copilot-chat'
  | 'copilot-proxy-chat'
  | 'github-models-chat'
  | 'deepinfra-chat'
  | 'bedrock-chat'
  | 'cloudflare-chat'
  | 'vercel-gateway-chat'
  | 'cf-ai-gateway-chat';

/** 适配器通用配置 */
export interface AdapterConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  authMode?: 'api-key' | 'aws-sdk' | 'oauth' | 'token' | 'bearer' | 'none';
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
  /** 是否支持 streaming（supportsStreaming 的简短别名） */
  streaming?: boolean;
  /** 是否支持 tool call（supportsToolCalls 的简短别名） */
  toolCall?: boolean;
  /** 是否支持 vision（supportsVision 的简短别名） */
  vision?: boolean;
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

// ============================================================================
// 非生成式 / 多媒体适配器接口
//
// 以下接口面向非 LLM 能力（语音转文字、图像/视频生成）。它们与 IAiApiAdapter
// 的调用语义不同，因此独立定义；统一通过 ModelApiType 在 registry 中注册。
// ============================================================================

/** STT（语音转文字）适配器配置 */
export interface SttAdapterConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  /** 音频语言提示（如 'zh'、'en'），不指定则由服务端自动检测 */
  language?: string;
  /** 采样率（Hz），用于流式编码协商 */
  sampleRate?: number;
  signal?: AbortSignal;
}

/** 批量转写音频输入 */
export interface SttAudioInput {
  /** 音频数据 */
  data: Uint8Array | ArrayBuffer | Blob;
  /** MIME 类型，如 'audio/wav'、'audio/mp3' */
  mimeType: string;
}

/** 转写结果 */
export interface SttResponse {
  /** 完整转写文本 */
  text: string;
  /** 分段时间轴 */
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  /** 检测到的语言 */
  language?: string;
  /** 音频时长（秒） */
  duration?: number;
}

/** 流式转写回调 */
export interface SttStreamCallbacks {
  /** 收到增量/最终文本时触发 */
  onTranscript: (text: string, isFinal: boolean) => void;
}

/** STT 适配器接口（支持批量与流式） */
export interface ISttAdapter {
  readonly apiType: ModelApiType;
  /** 批量转写整段音频 */
  transcribe(config: SttAdapterConfig, audio: SttAudioInput): Promise<SttResponse>;
  /** 流式转写：实时读取音频流并回调结果 */
  transcribeStream(
    config: SttAdapterConfig,
    audioStream: ReadableStream<Uint8Array>,
    callbacks: SttStreamCallbacks,
  ): Promise<SttResponse>;
}

/** STT 适配器工厂函数类型 */
export type SttAdapterFactory = () => ISttAdapter;

/** 多媒体生成适配器配置 */
export interface MediaGenAdapterConfig {
  apiEndpoint: string;
  apiKey?: string;
  modelId: string;
  signal?: AbortSignal;
}

/** 图像生成输入 */
export interface ImageGenInput {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  numImages?: number;
  extraParams?: Record<string, unknown>;
}

/** 视频生成输入 */
export interface VideoGenInput {
  prompt: string;
  negativePrompt?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  extraParams?: Record<string, unknown>;
}

/** 多媒体生成结果 */
export interface MediaGenResponse {
  /** 生成产物 URL 列表（图片或视频） */
  urls: string[];
  /** 任务状态（同步端点通常为 succeeded） */
  status: 'succeeded' | 'failed' | 'pending';
  /** 原始响应（调试用） */
  raw?: unknown;
}

/** 多媒体生成适配器接口（图像/视频） */
export interface IMediaGenAdapter {
  readonly apiType: ModelApiType;
  /** 图像生成 */
  generateImage(config: MediaGenAdapterConfig, input: ImageGenInput): Promise<MediaGenResponse>;
  /** 视频生成 */
  generateVideo(config: MediaGenAdapterConfig, input: VideoGenInput): Promise<MediaGenResponse>;
}

/** 多媒体生成适配器工厂函数类型 */
export type MediaGenAdapterFactory = () => IMediaGenAdapter;
