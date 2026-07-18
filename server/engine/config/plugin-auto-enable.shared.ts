// 移植自 openclaw/src/config/plugin-auto-enable.shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type PluginAutoEnableCandidate = unknown;
export type PluginAutoEnableResult = unknown;
export function configMayNeedPluginAutoEnable(...args: unknown[]): unknown {
  throw new Error("not implemented: configMayNeedPluginAutoEnable");
}
export function resolvePluginAutoEnableReadiness(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginAutoEnableReadiness");
}
export function resolvePluginAutoEnableCandidateReason(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginAutoEnableCandidateReason");
}
export function resolveConfiguredPluginAutoEnableCandidates(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveConfiguredPluginAutoEnableCandidates");
}
export function resolvePluginAutoEnableManifestRegistry(...args: unknown[]): unknown {
  throw new Error("not implemented: resolvePluginAutoEnableManifestRegistry");
}
export function materializePluginAutoEnableCandidatesInternal(...args: unknown[]): unknown {
  throw new Error("not implemented: materializePluginAutoEnableCandidatesInternal");
}
