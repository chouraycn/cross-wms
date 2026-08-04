/** Converts a Headers object to a plain record for provider request handling. */
export function headersToRecord(headers: Headers): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of (headers as any).entries() as IterableIterator<[string, string]>) {
    result[key] = value;
  }
  return result;
}
