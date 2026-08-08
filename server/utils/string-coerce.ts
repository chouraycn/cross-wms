/** Reads a value only when it is already a string, preserving whitespace. */
export function readStringValue(value: any): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Trims string input and returns null for non-strings or empty strings. */
export function normalizeNullableString(value: any): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/** Trims string input and returns undefined for non-strings or empty strings. */
export function normalizeOptionalString(value: any): string | undefined {
  return normalizeNullableString(value) ?? undefined;
}

/** Stringifies primitive ids/flags before applying optional string normalization. */
export function normalizeStringifiedOptionalString(value: any): string | undefined {
  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return normalizeOptionalString(String(value));
  }
  return undefined;
}

/** Normalizes an optional array of primitive-ish values into non-empty strings. */
export function normalizeStringifiedEntries(values?: ReadonlyArray<any>): string[] {
  return (values ?? [])
    .map((entry) => normalizeStringifiedOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

/** Lowercases a normalized optional string. */
export function normalizeOptionalLowercaseString(value: any): string | undefined {
  return normalizeOptionalString(value)?.toLowerCase();
}

/** Lowercases a normalized string or returns an empty string when absent. */
export function normalizeLowercaseStringOrEmpty(value: any): string {
  return normalizeOptionalLowercaseString(value) ?? "";
}

export type FastMode = boolean | "auto";

/** Parses loose boolean/fast-mode flags from strings or booleans. */
export function normalizeFastMode(raw?: any): FastMode | undefined {
  if (typeof raw === "boolean") {
    return raw;
  }
  if (!raw) {
    return undefined;
  }
  const key = normalizeLowercaseStringOrEmpty(raw);
  if (["off", "false", "no", "0", "disable", "disabled", "normal"].includes(key)) {
    return false;
  }
  if (["on", "true", "yes", "1", "enable", "enabled", "fast"].includes(key)) {
    return true;
  }
  if (["auto", "automatic"].includes(key)) {
    return "auto";
  }
  return undefined;
}

/** Lowercases text while intentionally preserving surrounding whitespace. */
export function lowercasePreservingWhitespace(value: string): string {
  return value.toLowerCase();
}

/** Locale-aware lowercase helper that still preserves surrounding whitespace. */
export function localeLowercasePreservingWhitespace(value: string): string {
  return value.toLocaleLowerCase();
}

/** Reads a string directly or from an object's `primary` field. */
export function resolvePrimaryStringValue(value: any): string | undefined {
  if (typeof value === "string") {
    return normalizeOptionalString(value);
  }
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return normalizeOptionalString((value as { primary?: any }).primary);
}

/** Normalizes thread ids that may be numeric or string-backed. */
export function normalizeOptionalThreadValue(value: any): string | number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.trunc(value) : undefined;
  }
  return normalizeOptionalString(value);
}

/** Normalizes a thread/id value and stringifies finite numeric ids. */
export function normalizeOptionalStringifiedId(value: any): string | undefined {
  const normalized = normalizeOptionalThreadValue(value);
  return normalized == null ? undefined : String(normalized);
}

/** Type guard for strings that remain non-empty after trimming. */
export function hasNonEmptyString(value: any): value is string {
  return normalizeOptionalString(value) !== undefined;
}
