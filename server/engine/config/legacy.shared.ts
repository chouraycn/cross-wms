// 移植自 openclaw/src/config/legacy.shared.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export type LegacyConfigRule = unknown;
export type LegacyConfigMigrationSpec = unknown;
export const getRecord: any = undefined;
export const ensureRecord: any = undefined;
export const mergeMissing: any = undefined;
export const mapLegacyAudioTranscription: any = undefined;
export const defineLegacyConfigMigration: any = undefined;
