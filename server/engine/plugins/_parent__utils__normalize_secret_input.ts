// Re-export from canonical implementation at server/engine/infra/normalize-secret-input.ts
// 替代原 stub（返回 undefined 会导致 provider-auth-helpers / provider-self-hosted-setup /
// provider-auth-input 中的密钥规范化静默失败）
// 参考 openclaw/src/utils/normalize-secret-input.ts
export {
  normalizeSecretInput,
  normalizeOptionalSecretInput,
} from "../infra/normalize-secret-input.js";
