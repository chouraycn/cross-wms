// 重新导出 types/secrets.ts 的完整类型定义
// 替代原 stub（返回 undefined 会导致 provider-auth-helpers.ts 中的
// coerceSecretRef / parseEnvTemplateSecretRef / DEFAULT_SECRET_PROVIDER_ALIAS 静默失败）
// 参考 openclaw/src/config/types.secrets.ts
export * from './types/secrets.js';
