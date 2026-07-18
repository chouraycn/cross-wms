// 移植自 openclaw/src/config/zod-schema.secret-input-validation.ts
// 降级策略：依赖项未移植，函数体抛出 not implemented 错误

export function validateTelegramWebhookSecretRequirements(...args: unknown[]): unknown {
  throw new Error("not implemented: validateTelegramWebhookSecretRequirements");
}
export function validateSlackSigningSecretRequirements(...args: unknown[]): unknown {
  throw new Error("not implemented: validateSlackSigningSecretRequirements");
}
