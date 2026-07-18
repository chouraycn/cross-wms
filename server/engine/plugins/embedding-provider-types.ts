/**
 * 插件贡献 embedding provider 的类型契约。
 *
 * 降级说明：原实现依赖 ../config/types.openclaw.js 的 OpenClawConfig 与
 * ../config/types.secrets.js 的 SecretInput，cross-wms 暂未移植这些模块，
 * 这里以本地占位类型替代。
 */

/** OpenClaw 配置（降级为 unknown 占位）。 */
export type OpenClawConfig = Record<string, unknown>;

/** 密钥输入（降级为 unknown 占位）。 */
export type SecretInput = unknown;

/** embedding provider 接受的输入，包含多模态 inline-data 部分。 */
export type EmbeddingInput =
  | string
  | {
      text: string;
      parts?: Array<
        { type: "text"; text: string } | { type: "inline-data"; mimeType: string; data: string }
      >;
    };

/** embedding provider 调用传入的逐调用选项。 */
export type EmbeddingProviderCallOptions = {
  signal?: AbortSignal;
  inputType?: "query" | "document" | "semantic" | "classification" | "clustering";
};

/** 创建 embedding provider 时返回的运行时元数据。 */
export type EmbeddingProviderRuntime = {
  id: string;
  cacheKeyData?: Record<string, unknown>;
  /** 与当前身份等价的既有持久化 model/cache 身份。 */
  indexIdentityAliases?: Array<{
    model: string;
    cacheKeyData: Record<string, unknown>;
  }>;
  inlineQueryTimeoutMs?: number;
  inlineBatchTimeoutMs?: number;
};

/** provider 拥有的规范身份与持久化索引的精确别名。 */
export type EmbeddingProviderIndexIdentity = {
  model: string;
  cacheKeyData: Record<string, unknown>;
  aliases?: Array<{
    model: string;
    cacheKeyData: Record<string, unknown>;
  }>;
};

/** memory/search 调用方使用的已创建 embedding provider 实例。 */
export type EmbeddingProvider = {
  id: string;
  model: string;
  dimensions?: number;
  maxInputTokens?: number;
  embed: (input: EmbeddingInput, options?: EmbeddingProviderCallOptions) => Promise<number[]>;
  embedBatch: (
    inputs: EmbeddingInput[],
    options?: EmbeddingProviderCallOptions,
  ) => Promise<number[][]>;
  close?: () => Promise<void> | void;
};

/** 创建 provider 时传给 embedding provider adapter 的选项。 */
export type EmbeddingProviderCreateOptions = {
  config: OpenClawConfig;
  agentDir?: string;
  provider?: string;
  remote?: {
    baseUrl?: string;
    apiKey?: SecretInput;
    headers?: Record<string, string>;
  };
  model: string;
  inputType?: string;
  queryInputType?: string;
  documentInputType?: string;
  local?: {
    modelPath?: string;
    modelCacheDir?: string;
  };
  dimensions?: number;
  taskType?: string;
};

/** embedding provider adapter create 调用返回的结果。 */
export type EmbeddingProviderCreateResult = {
  provider: EmbeddingProvider | null;
  runtime?: EmbeddingProviderRuntime;
};

/** 核心或插件 embedding provider 注册的 adapter 契约。 */
export type EmbeddingProviderAdapter = {
  id: string;
  defaultModel?: string;
  transport?: "local" | "remote";
  authProviderId?: string;
  resolveIndexIdentity?: (
    options: EmbeddingProviderCreateOptions,
  ) => EmbeddingProviderIndexIdentity;
  create: (options: EmbeddingProviderCreateOptions) => Promise<EmbeddingProviderCreateResult>;
  formatSetupError?: (err: unknown) => string;
};

/** 已注册的 embedding provider，带可选归属插件元数据。 */
export type RegisteredEmbeddingProvider = {
  adapter: EmbeddingProviderAdapter;
  ownerPluginId?: string;
};
