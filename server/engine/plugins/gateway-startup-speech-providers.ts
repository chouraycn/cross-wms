/**
 * Collects startup speech provider metadata from plugin manifests.
 * 移植自 openclaw/src/plugins/gateway-startup-speech-providers.ts。
 * 降级策略：依赖项未移植时，函数体降级为返回默认值或抛出 not implemented；
 * 类型定义保留形状供下游引用。
 */

export function normalizeConfiguredSpeechProviderIdForStartup(...args: unknown[]): unknown {
  throw new Error("not implemented: normalizeConfiguredSpeechProviderIdForStartup");
}

export function collectConfiguredSpeechProviderIds(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfiguredSpeechProviderIds");
}

