import { resolveTranscriptPathForComparison } from './session-transcript-path.js';

const TRANSCRIPT_SESSION_KEY_CACHE = new Map<string, string>();
const TRANSCRIPT_SESSION_KEY_CACHE_MAX = 256;

export function clearSessionTranscriptKeyCacheForTests(): void {
  TRANSCRIPT_SESSION_KEY_CACHE.clear();
}

export function resolveSessionKeyForTranscriptFile(
  sessionFile: string,
  sessionStore: Record<string, { sessionId?: string; sessionFile?: string }>,
): string | undefined {
  const targetPath = resolveTranscriptPathForComparison(sessionFile);
  if (!targetPath) {
    return undefined;
  }

  const cachedKey = TRANSCRIPT_SESSION_KEY_CACHE.get(targetPath);
  if (cachedKey && sessionStore[cachedKey]) {
    return cachedKey;
  }

  const matchingKeys: string[] = [];
  for (const [key, entry] of Object.entries(sessionStore)) {
    if (!entry?.sessionId) continue;
    const entryPath = resolveTranscriptPathForComparison(entry.sessionFile);
    if (entryPath === targetPath) {
      matchingKeys.push(key);
    }
  }

  if (matchingKeys.length > 0) {
    const resolvedKey = matchingKeys[0];
    if (
      !TRANSCRIPT_SESSION_KEY_CACHE.has(targetPath) &&
      TRANSCRIPT_SESSION_KEY_CACHE.size >= TRANSCRIPT_SESSION_KEY_CACHE_MAX
    ) {
      const oldest = TRANSCRIPT_SESSION_KEY_CACHE.keys().next().value;
      if (oldest !== undefined) {
        TRANSCRIPT_SESSION_KEY_CACHE.delete(oldest);
      }
    }
    TRANSCRIPT_SESSION_KEY_CACHE.set(targetPath, resolvedKey);
    return resolvedKey;
  }

  TRANSCRIPT_SESSION_KEY_CACHE.delete(targetPath);
  return undefined;
}
