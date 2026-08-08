// 移植自 openclaw/src/infra/system-run-normalize.ts

/** Normalizes unknown system-run metadata to a trimmed non-empty string. */
export function normalizeNonEmptyString(value: any): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Coerces array entries to strings while rejecting non-array inputs. */
export function normalizeStringArray(value: any): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
