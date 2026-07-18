/**
 * 解析历史会话消息的图片净化限值。
 *
 * 注意：原 openclaw 实现依赖 config/types.openclaw.js 中的 OpenClawConfig 类型。
 * 本地降级实现将其视为 unknown，仅保留运行时字段访问能力。
 */

// OpenClawConfig 在本地未完整移植，这里以 unknown 降级处理。
type OpenClawConfig = unknown;

// 工具与 provider 负载构建器共享的图片净化限值。
export type ImageSanitizationLimits = {
  maxDimensionPx?: number;
  maxBytes?: number;
};

export const DEFAULT_IMAGE_MAX_DIMENSION_PX = 1200;
export const DEFAULT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** 解析 agent 负载的已配置图片净化限值。 */
export function resolveImageSanitizationLimits(cfg?: OpenClawConfig): ImageSanitizationLimits {
  const configured = readConfiguredImageMaxDimensionPx(cfg);
  if (typeof configured !== "number" || !Number.isFinite(configured)) {
    return {};
  }
  return { maxDimensionPx: Math.max(1, Math.floor(configured)) };
}

// 降级访问 cfg.agents?.defaults?.imageMaxDimensionPx；OpenClawConfig 类型未本地化。
function readConfiguredImageMaxDimensionPx(cfg: unknown): number | undefined {
  if (!cfg || typeof cfg !== "object") {
    return undefined;
  }
  const agents = (cfg as { agents?: unknown }).agents;
  if (!agents || typeof agents !== "object") {
    return undefined;
  }
  const defaults = (agents as { defaults?: unknown }).defaults;
  if (!defaults || typeof defaults !== "object") {
    return undefined;
  }
  const value = (defaults as { imageMaxDimensionPx?: unknown }).imageMaxDimensionPx;
  return typeof value === "number" ? value : undefined;
}
