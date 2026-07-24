// 移植自 openclaw/src/config/allowed-values.ts

export type AllowedValuesSummary = {
  values: string[];
  hiddenCount: number;
  formatted: string;
};

export function summarizeAllowedValues(
  values: ReadonlyArray<unknown>,
): AllowedValuesSummary | null {
  if (values.length === 0) {
    return null;
  }

  // Simplified implementation for cross-wms
  const shown = values.slice(0, 12).map((v) =>
    typeof v === "string" ? v : JSON.stringify(v)
  );
  const hiddenCount = values.length - shown.length;
  const formattedCore = shown.map((v) => JSON.stringify(v)).join(", ");
  const formatted =
    hiddenCount > 0
      ? `${formattedCore}, ... (+${hiddenCount} more)`
      : formattedCore;

  return {
    values: shown,
    hiddenCount,
    formatted,
  };
}

export function appendAllowedValuesHint(
  message: string,
  summary: AllowedValuesSummary,
): string {
  const lower = message.toLowerCase();
  if (lower.includes("(allowed:") || lower.includes("expected one of")) {
    return message;
  }
  return `${message} (allowed: ${summary.formatted})`;
}
