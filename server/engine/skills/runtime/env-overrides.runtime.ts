// Runtime env override facade keeps env override loading behind a lazy boundary.
//
// 移植自 openclaw/src/skills/runtime/env-overrides.runtime.ts。
// openclaw 原文件从 ./env-overrides.js 导入 getActiveSkillEnvKeys，但 cross-wms 的
// env-overrides.ts 是独立实现，不导出该函数。这里提供简化版占位实现，返回空集合。
// 当 cross-wms env-overrides 实现补齐 active skill env key 跟踪后，可恢复为转发调用。

/** Returns a snapshot of env var keys currently injected by skill overrides. */
export function getActiveSkillEnvKeys(): ReadonlySet<string> {
  // cross-wms env-overrides 实现尚未追踪 active skill env keys，返回空集合作为占位。
  return new Set<string>();
}
