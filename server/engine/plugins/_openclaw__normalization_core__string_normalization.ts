export function uniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

export function sortUniqueStrings(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function normalizeTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(String)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

export function normalizeOptionalTrimmedStringList(value: unknown): string[] | undefined {
  const result = normalizeTrimmedStringList(value);
  return result.length === 0 ? undefined : result;
}

export function normalizeArrayBackedTrimmedStringList(value: unknown): string[] {
  return normalizeTrimmedStringList(value);
}

export function normalizeStringEntries(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item).trim())
    .filter((s) => s.length > 0);
}

export function normalizeSortedUniqueStringEntries(value: unknown): string[] {
  const entries = normalizeStringEntries(value);
  const seen = new Set<string>();
  return entries
    .filter((key) => {
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeUniqueSingleOrTrimmedStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? [trimmed] : [];
  }
  return normalizeTrimmedStringList(value);
}

export function normalizeUniqueStringEntries(value: unknown): string[] {
  const entries = normalizeStringEntries(value);
  const seen = new Set<string>();
  return entries.filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
