// === PENDING MIGRATION STUB ===
// Source: openclaw/src/commands/auth-choice-legacy.ts (待迁移)
// Status: 类型安全 no-op 实现 — identity 函数，原样返回 choice
// Used by: server/engine/plugins/provider-auth-choice-preference.ts
// 注：openclaw 同源实现规范化遗留的 onboard auth choice 字符串

export const normalizeLegacyOnboardAuthChoice = (
  choice: string,
  _options?: { env?: NodeJS.ProcessEnv },
): string => choice;
