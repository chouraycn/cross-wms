// 移植自 openclaw/src/config/io.health-state.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ConfigHealthFingerprint = unknown;
export type ConfigHealthEntry = unknown;
export type ConfigHealthState = unknown;
export type ConfigHealthStateDeps = unknown;
export function readConfigHealthStateFromStore(...args: unknown[]): unknown {
  throw new Error("not implemented: readConfigHealthStateFromStore");
}
export function writeConfigHealthStateToStore(...args: unknown[]): unknown {
  throw new Error("not implemented: writeConfigHealthStateToStore");
}
