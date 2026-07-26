// Pure helpers for doctor skill readiness repairs.
// 移植自 openclaw/src/commands/doctor-skills-core.ts
//
// 降级说明：
//  - SkillStatusEntry / SkillStatusReport 来自 ../skills/discovery/status.js
//    → 未移植，使用简化类型定义
import type { OpenClawConfig } from "../config/types.openclaw.js";

export type SkillStatusEntry = {
  skillKey: string;
  eligible: boolean;
  disabled: boolean;
  blockedByAllowlist: boolean;
  blockedByAgentFilter: boolean;
  platformIncompatible: boolean;
  missing: {
    bins: string[];
    anyBins: string[];
    env: string[];
    config: string[];
    os: string[];
  };
};

export type SkillStatusReport = {
  skills: SkillStatusEntry[];
};

export function collectUnavailableAgentSkills(report: SkillStatusReport): SkillStatusEntry[] {
  return report.skills.filter(
    (skill) =>
      !skill.eligible &&
      !skill.disabled &&
      !skill.blockedByAllowlist &&
      !skill.blockedByAgentFilter &&
      !skill.platformIncompatible,
  );
}

export function formatMissingSkillSummary(skill: SkillStatusEntry): string {
  const missing: string[] = [];
  if (skill.missing.bins.length > 0) {
    missing.push(`bins: ${skill.missing.bins.join(", ")}`);
  }
  if (skill.missing.anyBins.length > 0) {
    missing.push(`any bins: ${skill.missing.anyBins.join(", ")}`);
  }
  if (skill.missing.env.length > 0) {
    missing.push(`env: ${skill.missing.env.join(", ")}`);
  }
  if (skill.missing.config.length > 0) {
    missing.push(`config: ${skill.missing.config.join(", ")}`);
  }
  if (skill.missing.os.length > 0) {
    missing.push(`os: ${skill.missing.os.join(", ")}`);
  }
  return missing.join("; ") || "unknown requirement";
}

export function disableUnavailableSkillsInConfig(
  config: OpenClawConfig,
  skills: readonly SkillStatusEntry[],
): OpenClawConfig {
  if (skills.length === 0) {
    return config;
  }
  const entries = { ...config.skills?.entries };
  for (const skill of skills) {
    entries[skill.skillKey] = {
      ...entries[skill.skillKey],
      enabled: false,
    };
  }
  return {
    ...config,
    skills: {
      ...config.skills,
      entries,
    },
  };
}
