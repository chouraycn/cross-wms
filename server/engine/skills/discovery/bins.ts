import type { SkillEntry } from "../types.js";

export function collectSkillBins(entries: SkillEntry[]): string[] {
  const bins = new Set<string>();

  for (const entry of entries) {
    const metadata = entry.metadata || {};
    const required = (metadata.requires as Record<string, unknown>)?.bins as string[] ?? [];
    const anyBins = (metadata.requires as Record<string, unknown>)?.anyBins as string[] ?? [];
    const install = metadata.install as Array<Record<string, unknown>> ?? [];

    for (const bin of required) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }

    for (const bin of anyBins) {
      const trimmed = bin.trim();
      if (trimmed) {
        bins.add(trimmed);
      }
    }

    for (const spec of install) {
      const specBins = spec?.bins as string[] ?? [];
      for (const bin of specBins) {
        const trimmed = String(bin).trim();
        if (trimmed) {
          bins.add(trimmed);
        }
      }
    }
  }

  return [...bins].sort();
}