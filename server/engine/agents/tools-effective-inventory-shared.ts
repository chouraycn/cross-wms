/**
 * 移植自 openclaw/src/agents/tools-effective-inventory-shared.ts
 *
 * Shared helpers for effective tool inventory construction.
 * cross-wms 简化实现：提供基本的标签解析和去重逻辑。
 */

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeLowercaseStringOrEmpty(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.toLowerCase();
}

export type EffectiveToolInventoryEntry = {
  name: string;
  label: string;
  description: string;
  sourceInfo?: unknown;
};

/** Resolve the display label for a tool. */
export function resolveEffectiveToolLabel(tool: {
  name: string;
  label?: string;
}): string {
  const rawLabel = normalizeOptionalString(tool.label) ?? "";
  if (
    rawLabel &&
    normalizeLowercaseStringOrEmpty(rawLabel) !== normalizeLowercaseStringOrEmpty(tool.name)
  ) {
    return rawLabel;
  }
  return tool.name;
}

/** Resolve the raw description for a tool. */
export function resolveEffectiveToolRawDescription(tool: {
  description?: string;
}): string {
  return normalizeOptionalString(tool.description) ?? "";
}

/** Summarize a tool description for display. */
export function summarizeEffectiveToolDescription(tool: {
  description?: string;
  displaySummary?: string;
}): string {
  const displaySummary = normalizeOptionalString(tool.displaySummary);
  if (displaySummary) {
    return displaySummary;
  }
  return resolveEffectiveToolRawDescription(tool);
}

/** Disambiguate duplicate tool labels by appending a provider/source suffix. */
export function disambiguateEffectiveToolLabels(
  entries: EffectiveToolInventoryEntry[],
  resolveSuffix: (entry: EffectiveToolInventoryEntry) => string,
): EffectiveToolInventoryEntry[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  }
  return entries.map((entry) => {
    if ((counts.get(entry.label) ?? 0) < 2) {
      return entry;
    }
    return { ...entry, label: `${entry.label} (${resolveSuffix(entry)})` };
  });
}
