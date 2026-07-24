// === PENDING MIGRATION STUB (mixed: real types + degraded impls) ===
// Source: openclaw/src/packages/speech-core/voice-models.ts (待迁移)
// Status: 类型导出已实化；函数实现为类型安全 no-op（返回空数组）
// Used by: server/engine/plugins/{model-catalog-registration,capability-provider-runtime}.ts
//
// 注：@cdf-know/speech-core 同源包已存在于 packages/speech-core/，但该包中
// 没有 voice-models 模块，也不导出 resolveVoiceModelRefs /
// synthesizeVoiceModelCatalogEntries，因此保留 no-op stub 实现不变。
//
// 类型导出保留了合理的占位定义，使调用方仍可使用相关类型断言。

export const resolveVoiceModelRefs = (_value: unknown): Array<{ provider: string }> => [];

// Auto-generated stub exports (added by auto-fix-exports.mjs)
export const synthesizeVoiceModelCatalogEntries = (_params: unknown): never[] => [];

// Type exports for voice model contracts.
export type VoiceModelCapabilities = { [key: string]: unknown };
export type VoiceModelProvider = { id: string; [key: string]: unknown };
