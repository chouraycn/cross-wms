/**
 * Provider 抽象层共享类型。
 *
 * 每个 Provider 模块导出一个 `providerInfo` 描述元数据，以及若干纯函数
 * 用于构建请求头、请求体、解析流式 chunk 与 usage。这样可以在不发起
 * 网络请求的情况下进行单元测试。
 */
import type { Api, CompleteOptions, Model, StreamEvent } from '../types.js';

/** Provider 所属区域，用于路由与合规判断。 */
export type ProviderRegion = 'global' | 'cn' | 'us' | 'eu';

/** Provider 元数据描述。 */
export type ProviderInfo = {
  /** 内部标识（小写、kebab-case）。 */
  name: string;
  /** 展示名。 */
  displayName: string;
  /** 区域。 */
  region: ProviderRegion;
  /** 候选环境变量（按优先级）。 */
  envKeys: readonly string[];
  /** 默认 baseUrl。 */
  baseUrl: string;
  /** 支持的 API 类型。 */
  supportedApis: readonly Api[];
  /** 默认模型目录（部分字段，需与注册表合并）。 */
  defaultModels?: ReadonlyArray<{
    id: string;
    name: string;
    api: Api;
    contextWindow: number;
    maxOutputTokens?: number;
    cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
    reasoning?: boolean;
    capabilities?: readonly string[];
    aliases?: readonly string[];
  }>;
  /** 官方文档地址。 */
  docsUrl?: string;
};

/** 构建请求时所需的上下文。 */
export type ProviderRequestContext = {
  apiKey: string;
  baseUrl?: string;
  model: Model;
  options: CompleteOptions;
};

/** 请求头构造器。 */
export type ProviderHeaderBuilder = (ctx: ProviderRequestContext) => Record<string, string>;

/** 请求体构造器。 */
export type ProviderRequestBodyBuilder = (ctx: ProviderRequestContext) => unknown;

/** 流式 chunk 解析器：输入原始 chunk 数据，返回标准化的 StreamEvent 列表。 */
export type ProviderStreamChunkParser = (chunk: unknown) => StreamEvent[];

/** Usage 解析器：从原始响应中提取 token 计数。 */
export type ProviderUsageParser = (
  data: unknown,
) => { input: number; output: number; cacheRead: number; cacheWrite: number };

/** 完成（finish_reason / stop_reason）映射器。 */
export type ProviderFinishReasonMapper = (reason: unknown) => 'stop' | 'length' | 'tool_call' | 'error' | 'unknown';

/** Provider 抽象描述，将元数据与各纯函数聚合。 */
export type Provider = {
  info: ProviderInfo;
  buildHeaders: ProviderHeaderBuilder;
  buildRequestBody: ProviderRequestBodyBuilder;
  parseStreamChunk: ProviderStreamChunkParser;
  parseUsage: ProviderUsageParser;
  mapFinishReason: ProviderFinishReasonMapper;
};
