import type { Skill } from "./skill-contract.js";

export type SkillTelemetrySource = "bundled" | "workspace" | "unknown";

interface SkillSourceCompat extends Skill {
  sourceInfo?: {
    source?: string;
  };
}

export function resolveSkillSource(skill: Skill): string {
  const compatSkill = skill as SkillSourceCompat;
  const canonical = compatSkill.source ?? "";
  if (canonical) {
    return canonical;
  }
  const legacy = compatSkill.sourceInfo?.source ?? "";
  return legacy || "unknown";
}

export function resolveSkillTelemetrySourceValue(value: unknown): SkillTelemetrySource {
  const source = String(value ?? "").trim();
  if (source === "bundled" || source === "openclaw-bundled") {
    return "bundled";
  }
  if (
    source === "workspace" ||
    source === "openclaw-workspace" ||
    source === "openclaw-managed" ||
    source === "openclaw-extra" ||
    source === "agents-skills-personal" ||
    source === "agents-skills-project"
  ) {
    return "workspace";
  }
  return "unknown";
}

export function resolveSkillTelemetrySource(skill: Skill): SkillTelemetrySource {
  return resolveSkillTelemetrySourceValue(resolveSkillSource(skill));
}