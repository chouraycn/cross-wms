// String coercion helpers — cross-wms stub for openclaw's
// @openclaw/normalization-core/string-coerce. Only the helpers used by the
// ported media module are provided here.

/** Trims string input and returns undefined for non-strings or empty strings. */
export function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Lowercases a normalized optional string. */
export function normalizeOptionalLowercaseString(value: unknown): string | undefined {
  return normalizeOptionalString(value)?.toLowerCase();
}

/** Lowercases a normalized string or returns an empty string when absent. */
export function normalizeLowercaseStringOrEmpty(value: unknown): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}
