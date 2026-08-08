// @ts-nocheck
// Shared nullable record guard for doctor config walkers.
export function asObjectRecord(value: any): Record<string, any> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, any>;
}
