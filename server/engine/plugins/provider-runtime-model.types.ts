/**
 * 定义 provider 插件提供的运行时模型元数据。
 *
 * 降级说明：原实现依赖 openclaw/plugin-sdk/llm 的 Model 与
 * ../config/types.models.js 的 ModelCompatConfig、ModelMediaInputConfig，
 * cross-wms 暂未引入这些模块，这里以本地占位类型替代。
 */

/** 模型兼容性配置（降级为 unknown 占位）。 */
export type ModelCompatConfig = unknown;

/** 模型媒体输入配置（降级为 unknown 占位）。 */
export type ModelMediaInputConfig = unknown;

/** provider/plugin 发现、覆盖与兼容规范化后的完整运行时模型形状。 */
export type ProviderRuntimeModel = {
  id: string;
  name?: string;
  provider?: string;
  contextWindow?: number;
  inputCost?: number;
  outputCost?: number;
  cacheReadCost?: number;
  cacheWriteCost?: number;
  reasoning?: boolean;
  compat?: ModelCompatConfig;
  contextTokens?: number;
  params?: Record<string, unknown>;
  requestTimeoutMs?: number;
  mediaInput?: ModelMediaInputConfig;
  [key: string]: unknown;
};
