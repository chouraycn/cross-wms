// Static auth-choice option definitions used before provider manifests are loaded.
// 移植自 openclaw/src/commands/auth-choice-options.static.ts
//
// 降级说明：
//  - resolveLegacyAuthChoiceAliasesForCli 来自 ./auth-choice-legacy.js
//    → cross-wms 未移植（依赖 plugins/provider-auth-choices.js 未移植模块）。
//    此处降级为返回空数组，保留函数签名以便未来替换为正式实现。
//    当 includeLegacyAliases=true 时，调用方仅会缺失 legacy 别名，CORE 选项仍可用。
//  - AuthChoice / AuthChoiceGroupId 来自 ./onboard-types.js → cross-wms 已移植。
//  - OpenClawConfig 来自 ../gateway/_openclaw-stubs.js（宽松占位类型），
//    与 cli/plugins-command-helpers.js 等已移植模块保持一致。
import type { OpenClawConfig } from "../gateway/_openclaw-stubs.js";
import type { AuthChoice, AuthChoiceGroupId } from "./onboard-types.js";

export type AuthChoiceOption = {
  value: AuthChoice;
  label: string;
  hint?: string;
  groupId?: AuthChoiceGroupId;
  groupLabel?: string;
  groupHint?: string;
  assistantPriority?: number;
  assistantVisibility?: "visible" | "manual-only";
  onboardingFeatured?: boolean;
};

export type AuthChoiceGroup = {
  value: AuthChoiceGroupId;
  label: string;
  hint?: string;
  options: AuthChoiceOption[];
};

export const CORE_AUTH_CHOICE_OPTIONS: ReadonlyArray<AuthChoiceOption> = [
  {
    value: "custom-api-key",
    label: "Custom Provider",
    hint: "Any OpenAI or Anthropic compatible endpoint",
    groupId: "custom",
    groupLabel: "Custom Provider",
    groupHint: "Any OpenAI or Anthropic compatible endpoint",
  },
];

// ===== 内联 resolveLegacyAuthChoiceAliasesForCli stub =====
/**
 * 列出 manifest provider 仍识别的已弃用 CLI auth-choice 别名。
 *
 * 降级实现：openclaw 的 auth-choice-legacy.js 依赖 plugins/provider-auth-choices.js
 * （未移植）。此处返回空数组，保留函数签名以便未来替换为正式实现。
 */
function resolveLegacyAuthChoiceAliasesForCli(_params?: {
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): ReadonlyArray<AuthChoice> {
  return [];
}
// ===== stub 结束 =====

/** Format static auth-choice values for Commander help/validation text. */
export function formatStaticAuthChoiceChoicesForCli(params?: {
  includeSkip?: boolean;
  includeLegacyAliases?: boolean;
  config?: OpenClawConfig;
  workspaceDir?: string;
  env?: NodeJS.ProcessEnv;
}): string {
  const includeSkip = params?.includeSkip ?? true;
  const includeLegacyAliases = params?.includeLegacyAliases ?? false;
  const values = CORE_AUTH_CHOICE_OPTIONS.map((opt) => opt.value);

  if (includeSkip) {
    values.push("skip");
  }
  if (includeLegacyAliases) {
    values.push(...resolveLegacyAuthChoiceAliasesForCli(params));
  }

  return values.join("|");
}
