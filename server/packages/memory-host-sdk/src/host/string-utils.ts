// Small string normalization helpers kept local to memory-host-sdk for package
// builds that should not depend on the full normalization package graph.
/** Normalize a non-empty string or return null. */
export function normalizeNullableString(value: any): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Normalize a non-empty string or return undefined. */
export function normalizeOptionalString(value: any): string | undefined {
  return normalizeNullableString(value) ?? undefined;
}

/** Normalize a non-empty string to lowercase or return undefined. */
export function normalizeOptionalLowercaseString(value: any): string | undefined {
  return normalizeOptionalString(value)?.toLowerCase();
}

/** Normalize a value to lowercase text, defaulting to an empty string. */
export function normalizeLowercaseStringOrEmpty(value: any): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}

/** Normalize an array-like list of values into non-empty strings. */
export function normalizeStringEntries(values: ReadonlyArray<any>): string[] {
  return values.map((value) => normalizeOptionalString(String(value)) ?? "").filter(Boolean);
}

/** Return unique strings preserving first-seen order. */
export function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}
