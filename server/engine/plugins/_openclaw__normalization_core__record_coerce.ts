export function isRecord(value: any): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asNullableRecord(value: any): Record<string, any> | null {
  if (!isRecord(value)) return null;
  return value;
}
