import type { OpenClawConfig } from "../../config/types/openclaw.js";
import { resolveSkillRuntimeConfig } from "../loading/runtime-config.js";
import { loadWorkspaceSkills } from "../loading/workspace.js";
import type { SkillEligibilityContext, SkillEntry } from "../types.js";

export interface SkillSnapshot {
  resolvedSkills?: unknown;
}

export function resolveEmbeddedRunSkillEntries(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  agentId?: string;
  eligibility?: SkillEligibilityContext;
  skillsSnapshot?: SkillSnapshot;
  workspaceOnly?: boolean;
}): {
  shouldLoadSkillEntries: boolean;
  skillEntries: SkillEntry[];
} {
  const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
  const config = resolveSkillRuntimeConfig(params.config as any);

  return {
    shouldLoadSkillEntries,
    skillEntries: shouldLoadSkillEntries
      ? (loadWorkspaceSkills(params.workspaceDir) as any)
      : [],
  };
}