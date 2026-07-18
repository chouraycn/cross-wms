// 移植自 openclaw/src/config/doc-baseline.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigDocBaselineEntry = unknown;
export function collectConfigDocBaselineEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: collectConfigDocBaselineEntries");
}
export function dedupeConfigDocBaselineEntries(...args: unknown[]): unknown {
  throw new Error("not implemented: dedupeConfigDocBaselineEntries");
}
export function renderConfigDocBaselineArtifacts(...args: unknown[]): unknown {
  throw new Error("not implemented: renderConfigDocBaselineArtifacts");
}
export function writeConfigDocBaselineArtifacts(...args: unknown[]): unknown {
  throw new Error("not implemented: writeConfigDocBaselineArtifacts");
}
