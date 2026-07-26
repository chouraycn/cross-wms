// Shared types for applying auth-choice selections during onboarding and agent setup.
// 移植自 openclaw/src/commands/auth-choice.apply.types.ts
//
// 降级说明：
//  - OpenClawConfig 来自 ../config/types.openclaw.js
//    → cross-wms 已在 ../infra/_runtime-stubs.ts 提供降级类型
//  - RuntimeEnv 来自 ../runtime.js
//    → cross-wms 未移植该模块，使用 ../infra/runtime-guard.ts 中的降级 RuntimeEnv
//  - WizardPrompter 来自 ../wizard/prompts.js → cross-wms 已有
//  - AuthChoice / OnboardOptions 来自 ./onboard-types.js → cross-wms 已有
import type { OpenClawConfig } from "../infra/_runtime-stubs.js";
import type { RuntimeEnv } from "../infra/runtime-guard.js";
import type { WizardPrompter } from "../wizard/prompts.js";
import type { AuthChoice, OnboardOptions } from "./onboard-types.js";

export type ApplyAuthChoiceParams = {
  authChoice: AuthChoice;
  config: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
  agentDir?: string;
  setDefaultModel: boolean;
  preserveExistingDefaultModel?: boolean;
  agentId?: string;
  opts?: Partial<OnboardOptions>;
};

export type ApplyAuthChoiceResult = {
  config: OpenClawConfig;
  agentModelOverride?: string;
  retrySelection?: boolean;
};
