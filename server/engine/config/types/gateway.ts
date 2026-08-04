// Re-export of the canonical implementation to eliminate duplicated code (jscpd consolidation).
// 逻辑与 ../types.gateway.ts 完全一致，依赖解析等价（SecretInput 经 types.secrets -> types/secrets 同一实现）。
export * from "../types.gateway.js";
