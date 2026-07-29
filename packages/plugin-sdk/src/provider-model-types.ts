// 模型提供商与模型定义配置的公共 SDK 类型面。
// openclaw 原始实现从 ../config/types.models.js 重导出类型，该模块未移植，
// 此处本地重声明对应类型，保持公共类型签名一致。

/** Bedrock 模型发现配置。 */
export type BedrockDiscoveryConfig = {
  /** 是否启用自动发现。 */
  enabled: boolean;
  /** 发现的区域列表。 */
  regions?: string[];
  /** 发现的 profile 名称。 */
  profile?: string;
};

/** 模型 API 能力描述。 */
export type ModelApi = {
  /** 是否支持流式响应。 */
  streaming?: boolean;
  /** 是否支持函数/工具调用。 */
  toolUse?: boolean;
  /** 是否支持视觉输入。 */
  vision?: boolean;
  /** 是否支持音频输入。 */
  audio?: boolean;
  /** 最大上下文窗口（token 数）。 */
  contextWindow?: number;
  /** 最大输出 token 数。 */
  maxOutputTokens?: number;
};

/** 模型兼容性配置，用于跨提供商适配。 */
export type ModelCompatConfig = {
  /** 兼容族名称（如 openai、anthropic）。 */
  family?: string;
  /** 是否强制使用特定工具调用协议。 */
  toolCallProtocol?: "native" | "openai-compat" | "anthropic-compat";
  /** 是否需要推理输出特殊处理。 */
  reasoningOutputMode?: "auto" | "tagged" | "none";
};

/** 单个模型定义配置。 */
export type ModelDefinitionConfig = {
  /** 模型唯一标识。 */
  id: string;
  /** 模型显示名称。 */
  name?: string;
  /** 提供商 ID。 */
  providerId?: string;
  /** API 能力。 */
  api?: ModelApi;
  /** 兼容性配置。 */
  compat?: ModelCompatConfig;
  /** 是否为预览/实验模型。 */
  preview?: boolean;
};

/** 模型提供商配置。 */
export type ModelProviderConfig = {
  /** 提供商 ID。 */
  id: string;
  /** 提供商显示名称。 */
  name?: string;
  /** 基础 API URL。 */
  baseUrl?: string;
  /** 鉴权方式。 */
  auth?: "bearer" | "x-api-key" | "none";
  /** 该提供商下的模型定义列表。 */
  models?: ModelDefinitionConfig[];
  /** Bedrock 发现配置（仅 Bedrock 提供商使用）。 */
  bedrockDiscovery?: BedrockDiscoveryConfig;
};
