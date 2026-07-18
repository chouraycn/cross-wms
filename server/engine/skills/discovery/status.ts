import type { SkillEntry, SkillSource } from "../types.js";

export type SkillStatusSummary = {
  total: number;
  bySource: Record<SkillSource, number>;
  promptVisible: number;
  userInvocable: number;
  runtimeVisible: number;
  disabled: number;
};

export function computeSkillStatus(entries: readonly SkillEntry[]): SkillStatusSummary {
  const summary: SkillStatusSummary = {
    total: entries.length,
    bySource: {
      bundled: 0,
      workspace: 0,
      unknown: 0,
    },
    promptVisible: 0,
    userInvocable: 0,
    runtimeVisible: 0,
    disabled: 0,
  };

  for (const entry of entries) {
    const source = entry.skill.source;
    summary.bySource[source] = (summary.bySource[source] || 0) + 1;

    const promptVisible = entry.exposure?.includeInAvailableSkillsPrompt ?? 
      (entry.invocation ? !entry.invocation.disableModelInvocation : !entry.skill.disableModelInvocation);
    const userInvocable = entry.exposure?.userInvocable ?? 
      (entry.invocation?.userInvocable ?? true);
    const runtimeVisible = entry.exposure?.includeInRuntimeRegistry ?? true;
    const disabled = entry.invocation?.disableModelInvocation ?? entry.skill.disableModelInvocation;

    if (promptVisible) summary.promptVisible++;
    if (userInvocable) summary.userInvocable++;
    if (runtimeVisible) summary.runtimeVisible++;
    if (disabled) summary.disabled++;
  }

  return summary;
}

export function formatStatusReport(summary: SkillStatusSummary): string {
  const lines = [
    "Skills Status Report",
    "===================",
    `Total: ${summary.total}`,
    "",
    "By source:",
    `  Bundled: ${summary.bySource.bundled}`,
    `  Workspace: ${summary.bySource.workspace}`,
    `  Unknown: ${summary.bySource.unknown}`,
    "",
    `Prompt visible: ${summary.promptVisible}`,
    `User invocable: ${summary.userInvocable}`,
    `Runtime visible: ${summary.runtimeVisible}`,
    `Disabled: ${summary.disabled}`,
  ];
  return lines.join("\n");
}

export function listSkillsBySource(
  entries: readonly SkillEntry[],
  source: SkillSource,
): SkillEntry[] {
  return entries.filter((e) => e.skill.source === source);
}

export function getSkillNames(entries: readonly SkillEntry[]): string[] {
  return entries.map((e) => e.skill.name).sort();
}
