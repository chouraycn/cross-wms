function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractModelDirective(
  body?: string,
  options?: { aliases?: string[] },
): {
  cleaned: string;
  rawModel?: string;
  rawProfile?: string;
  rawRuntime?: string;
  hasDirective: boolean;
} {
  if (!body) return { cleaned: '', hasDirective: false };

  const modelMatch = body.match(
    /(?:^|\s)\/model(?=$|\s|:)\s*:?\s*([A-Za-z0-9_.:@-]+(?:\/[A-Za-z0-9_.:@-]+)*)?(?:\s+(?:--runtime|runtime=|harness=)\s*([A-Za-z0-9_.:-]+))?/i,
  );

  const aliases = options?.aliases ?? [];
  const aliasMatch = (modelMatch || aliases.length === 0)
    ? null
    : body.match(new RegExp(`(?:^|\\s)\\/(${aliases.map(escapeRegExp).join('|')})(?=$|\\s|:)(?:\\s*:\\s*)?`, 'i'));

  const match = modelMatch ?? aliasMatch;
  const raw = modelMatch ? modelMatch?.[1]?.trim() : aliasMatch?.[1]?.trim();
  const rawRuntime = modelMatch?.[2]?.trim();

  let rawModel = raw;
  let rawProfile: string | undefined;
  if (raw) {
    const atIndex = raw.lastIndexOf('@');
    if (atIndex > 0) {
      rawModel = raw.slice(0, atIndex);
      rawProfile = raw.slice(atIndex + 1);
    }
  }

  const cleaned = match ? body.replace(match[0], ' ').replace(/\s+/g, ' ').trim() : body.trim();
  return { cleaned, rawModel, rawProfile, rawRuntime, hasDirective: Boolean(match) };
}
