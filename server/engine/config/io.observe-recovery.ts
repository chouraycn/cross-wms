// 移植自 openclaw/src/config/io.observe-recovery.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type ObserveRecoveryDeps = unknown;
export function resolveLastKnownGoodConfigPath(...args: unknown[]): unknown {
  throw new Error("not implemented: resolveLastKnownGoodConfigPath");
}
export function maybeRecoverSuspiciousConfigRead(...args: unknown[]): unknown {
  throw new Error("not implemented: maybeRecoverSuspiciousConfigRead");
}
export function maybeRecoverSuspiciousConfigReadSync(...args: unknown[]): unknown {
  throw new Error("not implemented: maybeRecoverSuspiciousConfigReadSync");
}
export function promoteConfigSnapshotToLastKnownGood(...args: unknown[]): unknown {
  throw new Error("not implemented: promoteConfigSnapshotToLastKnownGood");
}
export function recoverConfigFromLastKnownGood(...args: unknown[]): unknown {
  throw new Error("not implemented: recoverConfigFromLastKnownGood");
}
