// 移植自 openclaw/src/config/startup-migration.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type SessionStartupMigrationLogger = unknown;
export function runSessionStartupMigration(...args: unknown[]): unknown {
  throw new Error("not implemented: runSessionStartupMigration");
}
