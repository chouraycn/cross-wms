/**
 * 模型管理相关类型定义 — 前后端共享
 */

/** 模型提供商类型 — 覆盖主流国内外 API 平台 */
export type ModelProvider =
  | 'openai'
  | 'anthropic'
  | 'tencent'
  | 'deepseek'
  | 'google'
  | 'qwen'
  | 'xai'
  | 'zai'
  | 'minimax'
  | 'kimi'
  | 'byteplus'
  | 'openrouter'
  | 'novita'
  | 'wwqglobal'
  | 'wwqcn'
  | 'aws'
  | 'azure'
  | 'vercel'
  | 'ollama'
  | 'bigmodel'
  | 'minimaxcn'
  | 'kimicn'
  | 'volcengine'
  | 'aliyun'
  | 'modelark'
  | 'ppio'
  | 'groq'
  | 'mistral'
  | 'nvidia'
  | 'cohere'
  | 'fireworks'
  | 'deepinfra'
  | 'cerebras'
  | 'perplexity'
  | 'litellm'
  | 'custom';

/** API 适配器类型 */
export type ModelApiType =
  | 'openai-chat'
  | 'openai-completions'
  | 'anthropic-messages'
  | 'google-generative-ai'
  | 'qwen-chat'
  | 'moonshot-chat';

/** 模型能力标签 */
export type ModelCapability = 'code' | 'longContext' | 'reasoning' | 'multimodal' | 'fast' | 'costEffective' | 'general' | 'search' | 'proxy';

/** 能力标签中文映射 */
export const CAPABILITY_LABELS: Record<ModelCapability, string> = {
  code: '代码',
  longContext: '长文本',
  reasoning: '推理',
  multimodal: '多模态',
  fast: '快速',
  costEffective: '低成本',
  general: '通用',
  search: '搜索',
  proxy: '代理',
};

/** 能力标签颜色映射 */
export const CAPABILITY_COLORS: Record<ModelCapability, string> = {
  code: '#3B82F6',
  longContext: '#8B5CF6',
  reasoning: '#F59E0B',
  multimodal: '#EC4899',
  fast: '#10B981',
  costEffective: '#06B6D4',
  general: '#6B7280',
  search: '#8B5CF6',
  proxy: '#6366F1',
};

/** 多 Key 配置项 */
export interface ApiKeyEntry {
  /** Key 标识（如 key-1、备用等） */
  label?: string;
  /** API Key 值 */
  key: string;
  /** 是否启用 */
  enabled?: boolean;
  /** 内部唯一 ID（用于 React key） */
  _uid?: string;
}

/** 模型配置接口 */
export interface ModelConfig {
  /** 唯一标识 */
  id: string;
  /** 模型名称（显示用） */
  name: string;
  /** 模型提供商 */
  provider: ModelProvider;
  /** 引用的 Provider 配置 ID（使用 Provider 级共享配置时设置） */
  providerConfigId?: string;
  /** API 端点（自定义提供商时使用，若引用 Provider 则从 Provider 继承） */
  apiEndpoint?: string;
  /** API Key（单 Key 模式，兼容旧数据，若引用 Provider 则从 Provider 继承） */
  apiKey?: string;
  /** API Key 引用（keychain:<modelId> 或 env:<VAR_NAME>） */
  apiKeyRef?: string;
  /** 多 API Key 列表（轮询/故障转移用，若引用 Provider 则从 Provider 继承） */
  apiKeys?: ApiKeyEntry[];
  /** 多 Key 引用列表（keychain:<modelId>:<index>） */
  apiKeyRefs?: string[];
  /** Key 轮询策略 */
  keyStrategy?: 'round-robin' | 'random' | 'failover';
  /** 模型启用状态 */
  enabled: boolean;
  /** 是否为默认模型 */
  isDefault?: boolean;
  /** 模型描述 */
  description?: string;
  /** 上下文窗口大小（token数，厂商标称值） */
  contextWindow?: number;
  /** 运行时有效上下文上限（用于 compaction 预算，通常小于 contextWindow） */
  contextTokens?: number;
  /** 最大输出 token 数 */
  maxTokens?: number;
  /** 生成温度（0-2，默认 1） */
  temperature?: number;
  /** Top P 采样（0-1，默认 1） */
  topP?: number;
  /** 模型能力标签 */
  capabilities?: ModelCapability[];
  /** 支持的思考级别（off/low/medium/high 等），为空表示不支持思考 */
  thinkingLevels?: string[];
  /** 默认思考级别 */
  defaultThinkingLevel?: string;
  /** Token 定价（USD / 百万 tokens） */
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
  /** 本地服务配置（自动启动/停止本地模型服务） */
  localService?: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    healthUrl?: string;
    readyTimeoutMs?: number;
    idleStopMs?: number;
  };
  /** 认证模式（若引用 Provider 则从 Provider 继承） */
  authMode?: 'api-key' | 'aws-sdk' | 'oauth' | 'token' | 'none';
  /** 自定义请求头（静态，若引用 Provider 则合并） */
  headers?: Record<string, string>;
  /** 模型级透传参数（provider 特定） */
  params?: Record<string, unknown>;
  /** 输入模态支持 */
  inputModalities?: Array<'text' | 'image' | 'video' | 'audio'>;
  /** API 适配器类型（不设置则自动推断） */
  apiType?: ModelApiType;
  /** Provider 兼容性配置 */
  compatConfig?: ModelCompatConfig;
  /** 媒体输入配置 */
  mediaInputConfig?: ModelMediaInputConfig;
  /** 使用统计（可选，由后端注入） */
  usageStats?: {
    callCount: number;
    lastUsedAt: string | null;
    avgResponseTime: number | null;
  };
  /** 是否被用户隐藏（删除内置模型时标记为隐藏而非物理删除） */
  hidden?: boolean;
}

/** Provider 级共享配置 — 同一 Provider 下的多个模型可继承这些配置 */
export interface ProviderConfig {
  /** 唯一标识 */
  id: string;
  /** Provider 名称（显示用） */
  name: string;
  /** 模型提供商类型 */
  provider: ModelProvider;
  /** API 基础端点（该 Provider 下所有模型共享） */
  apiEndpoint?: string;
  /** 默认 API Key（该 Provider 下所有模型共享） */
  apiKey?: string;
  /** API Key 引用（keychain:<providerId> 或 env:<VAR_NAME>） */
  apiKeyRef?: string;
  /** 多 API Key 列表（轮询/故障转移用，Provider 级共享） */
  apiKeys?: ApiKeyEntry[];
  /** 多 Key 引用列表（keychain:<providerId>:<index>） */
  apiKeyRefs?: string[];
  /** Key 轮询策略 */
  keyStrategy?: 'round-robin' | 'random' | 'failover';
  /** 认证模式 */
  authMode?: 'api-key' | 'aws-sdk' | 'oauth' | 'token' | 'none';
  /** 自定义请求头（Provider 级，模型级 headers 会合并覆盖） */
  headers?: Record<string, string>;
  /** Provider 级默认参数（模型级 params 会合并覆盖） */
  defaultParams?: Record<string, unknown>;
  /** 本地服务配置（Provider 级，如 Ollama 服务） */
  localService?: {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    healthUrl?: string;
    readyTimeoutMs?: number;
    idleStopMs?: number;
  };
  /** 描述 */
  description?: string;
  /** 是否启用 */
  enabled?: boolean;
  /** API 适配器类型（不设置则自动推断） */
  apiType?: ModelApiType;
  /** Provider 兼容性配置 */
  compatConfig?: ModelCompatConfig;
  /** 媒体输入配置 */
  mediaInputConfig?: ModelMediaInputConfig;
}

/** Provider 兼容性配置 — 精细控制 Provider 特定行为 */
export interface ModelCompatConfig {
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
  /** 不支持 system 消息时的处理方式 */
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
}

/** 媒体输入配置 — 控制媒体输入限制 */
export interface ModelMediaInputConfig {
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

/** 模型管理配置 */
export interface ModelsConfig {
  /** Provider 配置列表（v2 新增，Provider 级共享配置） */
  providers?: ProviderConfig[];
  /** 模型列表 */
  models: ModelConfig[];
  /** 当前选中的默认模型 ID */
  defaultModelId: string;
}

/** 模型配置模板 */
export interface ModelTemplate {
  id: string;
  name: string;
  description: string;
  models: Omit<ModelConfig, 'apiKey'>[];
  defaultModelId: string;
}

/** models.json 文件结构 */
export interface ModelsFile {
  version: number;
  /** Provider 配置列表（v2 新增，Provider 级共享配置） */
  providers?: ProviderConfig[];
  models: ModelConfig[];
  defaultModelId: string;
  updatedAt: string;
}
