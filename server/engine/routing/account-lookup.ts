function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  if (!value) return '';
  return String(value).trim().toLowerCase();
}

export function resolveAccountEntry<T>(
  accounts: Record<string, T> | undefined,
  accountId: string,
): T | undefined {
  if (!accounts || typeof accounts !== 'object') {
    return undefined;
  }
  if (Object.hasOwn(accounts, accountId)) {
    return accounts[accountId];
  }
  const normalized = normalizeLowercaseStringOrEmpty(accountId);
  const matchKey = Object.keys(accounts).find(
    (key) => normalizeLowercaseStringOrEmpty(key) === normalized,
  );
  return matchKey ? accounts[matchKey] : undefined;
}

export function resolveNormalizedAccountEntry<T>(
  accounts: Record<string, T> | undefined,
  accountId: string,
  normalizeAccountId: (accountId: string) => string,
): T | undefined {
  if (!accounts || typeof accounts !== 'object') {
    return undefined;
  }
  if (Object.hasOwn(accounts, accountId)) {
    return accounts[accountId];
  }
  const normalized = normalizeAccountId(accountId);
  const matchKey = Object.keys(accounts).find((key) => normalizeAccountId(key) === normalized);
  return matchKey ? accounts[matchKey] : undefined;
}

export function listAccountIds<T>(accounts: Record<string, T> | undefined): string[] {
  if (!accounts || typeof accounts !== 'object') {
    return [];
  }
  return Object.keys(accounts).sort((a, b) => a.localeCompare(b));
}
