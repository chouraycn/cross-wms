// 移植自 openclaw/src/infra/backup-create.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type BackupCreateOptions = unknown;
export type BackupCreateResult = unknown;
export type BackupTarRetryLogger = unknown;
export function formatBackupCreateSummary(...args: unknown[]): unknown {
  throw new Error("not implemented: formatBackupCreateSummary");
}
export function buildExtensionsNodeModulesFilter(...args: unknown[]): unknown {
  throw new Error("not implemented: buildExtensionsNodeModulesFilter");
}
export function createBackupArchive(...args: unknown[]): unknown {
  throw new Error("not implemented: createBackupArchive");
}
export const testApi: unknown = undefined;
export type __test = unknown;
