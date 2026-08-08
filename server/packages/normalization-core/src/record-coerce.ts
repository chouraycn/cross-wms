/** Type guard for non-array object records at browser-safe boundaries. */
export function isRecord(value: any): value is Record<string, any> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Coerces object-like values to records, falling back to an empty record. */
export function asRecord(value: any): Record<string, any> {
  return typeof value === "object" && value !== null ? (value as Record<string, any>) : {};
}

/** Reads a field only when it exists as a string. */
export function readStringField(
  record: Record<string, any> | null | undefined,
  key: string,
): string | undefined {
  const value = record?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Returns a non-array record or undefined. */
export function asOptionalRecord(value: any): Record<string, any> | undefined {
  return isRecord(value) ? value : undefined;
}

/** Returns a non-array record or null. */
export function asNullableRecord(value: any): Record<string, any> | null {
  return isRecord(value) ? value : null;
}

/** Returns any object-backed record, including arrays, or undefined. */
export function asOptionalObjectRecord(value: any): Record<string, any> | undefined {
  return value && typeof value === "object" ? (value as Record<string, any>) : undefined;
}

/** Returns any object-backed record, including arrays, or null. */
export function asNullableObjectRecord(value: any): Record<string, any> | null {
  return value && typeof value === "object" ? (value as Record<string, any>) : null;
}
