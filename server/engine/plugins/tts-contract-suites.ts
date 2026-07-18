// 移植自 openclaw/src/plugins/tts-contract-suites.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function describeTtsConfigContract(...args: unknown[]): unknown {
  throw new Error("not implemented: describeTtsConfigContract");
}
export function describeTtsSummarizationContract(...args: unknown[]): unknown {
  throw new Error("not implemented: describeTtsSummarizationContract");
}
export function describeTtsProviderRuntimeContract(...args: unknown[]): unknown {
  throw new Error("not implemented: describeTtsProviderRuntimeContract");
}
export function describeTtsAutoApplyContract(...args: unknown[]): unknown {
  throw new Error("not implemented: describeTtsAutoApplyContract");
}
