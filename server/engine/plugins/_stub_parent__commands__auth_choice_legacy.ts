/**
 * @deprecated This file uses legacy stub naming.
 * Future refactoring should rename to *.stub.ts convention.
 * See P3-23 in optimization plan.
 */

// === MIGRATED FROM OPENCLAW SOURCE (partial) ===
// Source: openclaw/src/commands/auth-choice-legacy.ts
// Status: 已移植 normalizeLegacyOnboardAuthChoice 核心映射（oauth → setup-token）
// Used by: server/engine/plugins/provider-auth-choice-preference.ts
// 注：openclaw 完整实现还解析 manifest deprecated provider auth choices，
//      依赖 resolveManifestDeprecatedProviderAuthChoice 等 deep dependency。
//      此处已移植不依赖 deep dependency 的核心映射逻辑。

/** Map old onboard auth choices to their current equivalents. */
export const normalizeLegacyOnboardAuthChoice = (
  choice: string,
  _options?: { env?: NodeJS.ProcessEnv },
): string | undefined => {
  if (choice === "oauth") {
    return "setup-token";
  }
  return choice;
};
