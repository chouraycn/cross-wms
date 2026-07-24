// === PENDING MIGRATION STUB ===
// Source: openclaw/src/version.ts (待迁移)
// Status: 结构化类型占位 stub — 类型为 Record<string, string | undefined> / no-op 函数实现
// 注：openclaw resolveCompatibilityHostVersion 解析 host 兼容性版本约束
//      依赖 cross-wms version + 多个 host constraints

export type RuntimeVersionEnv = Record<string, string | undefined>;

export const resolveCompatibilityHostVersion = (): string => "0.0.0";
