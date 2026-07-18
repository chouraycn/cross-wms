/**
 * 会话 ID 解析
 *
 * 解析用户提供的会话引用，支持模糊匹配
 */

import type { SessionRecord } from './types.js';
import { normalizeSessionId, looksLikeSessionId } from './session-id.js';

type SessionIdMatch = [string, SessionRecord];
type NormalizedSessionIdMatch = {
  sessionKey: string;
  entry: SessionRecord;
  normalizedSessionKey: string;
  normalizedRequestKey: string;
  isCanonicalSessionKey: boolean;
  isStructural: boolean;
};

type SessionIdMatchSelection =
  | { kind: 'none' }
  | { kind: 'ambiguous'; sessionKeys: string[] }
  | { kind: 'selected'; sessionKey: string };

function compareNormalizedUpdatedAtDescending(
  a: NormalizedSessionIdMatch,
  b: NormalizedSessionIdMatch,
): number {
  return (b.entry?.stats?.lastActivityAt ?? 0) - (a.entry?.stats?.lastActivityAt ?? 0);
}

function compareStoreKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function normalizeLowercaseStringOrEmpty(value: string | undefined | null): string {
  return (value ?? '').trim().toLowerCase();
}

function normalizeSessionIdMatches(
  matches: SessionIdMatch[],
  normalizedSessionId: string,
): NormalizedSessionIdMatch[] {
  return matches.map(([sessionKey, entry]) => {
    const normalizedSessionKey = normalizeLowercaseStringOrEmpty(sessionKey);
    const normalizedRequestKey = normalizedSessionKey;
    return {
      sessionKey,
      entry,
      normalizedSessionKey,
      normalizedRequestKey,
      isCanonicalSessionKey: sessionKey === normalizedSessionKey,
      isStructural:
        normalizedSessionKey.endsWith(`:${normalizedSessionId}`) ||
        normalizedRequestKey === normalizedSessionId ||
        normalizedRequestKey.endsWith(`:${normalizedSessionId}`),
    };
  });
}

function collapseAliasMatches(matches: NormalizedSessionIdMatch[]): NormalizedSessionIdMatch[] {
  const grouped = new Map<string, NormalizedSessionIdMatch[]>();
  for (const match of matches) {
    const bucket = grouped.get(match.normalizedRequestKey);
    if (bucket) {
      bucket.push(match);
    } else {
      grouped.set(match.normalizedRequestKey, [match]);
    }
  }

  return Array.from(grouped.values(), (group) => {
    if (group.length === 1) {
      return group[0];
    }
    return [...group].toSorted((a, b) => {
      const timeDiff = compareNormalizedUpdatedAtDescending(a, b);
      if (timeDiff !== 0) {
        return timeDiff;
      }
      if (a.isCanonicalSessionKey !== b.isCanonicalSessionKey) {
        return a.isCanonicalSessionKey ? -1 : 1;
      }
      return compareStoreKeys(a.normalizedSessionKey, b.normalizedSessionKey);
    })[0];
  });
}

function selectFreshestUniqueMatch(
  matches: NormalizedSessionIdMatch[],
): NormalizedSessionIdMatch | undefined {
  if (matches.length === 1) {
    return matches[0];
  }
  const sortedMatches = [...matches].toSorted(compareNormalizedUpdatedAtDescending);
  const [freshest, secondFreshest] = sortedMatches;
  if ((freshest?.entry?.stats?.lastActivityAt ?? 0) > (secondFreshest?.entry?.stats?.lastActivityAt ?? 0)) {
    return freshest;
  }
  return undefined;
}

export function resolveSessionIdMatchSelection(
  matches: Array<[string, SessionRecord]>,
  sessionId: string,
): SessionIdMatchSelection {
  if (matches.length === 0) {
    return { kind: 'none' };
  }

  const canonicalMatches = collapseAliasMatches(
    normalizeSessionIdMatches(matches, normalizeLowercaseStringOrEmpty(sessionId)),
  );
  if (canonicalMatches.length === 1) {
    return { kind: 'selected', sessionKey: canonicalMatches[0].sessionKey };
  }

  const structuralMatches = canonicalMatches.filter((match) => match.isStructural);
  const selectedStructuralMatch = selectFreshestUniqueMatch(structuralMatches);
  if (selectedStructuralMatch) {
    return { kind: 'selected', sessionKey: selectedStructuralMatch.sessionKey };
  }
  if (structuralMatches.length > 1) {
    return { kind: 'ambiguous', sessionKeys: structuralMatches.map((match) => match.sessionKey) };
  }

  const selectedCanonicalMatch = selectFreshestUniqueMatch(canonicalMatches);
  if (selectedCanonicalMatch) {
    return { kind: 'selected', sessionKey: selectedCanonicalMatch.sessionKey };
  }

  return { kind: 'ambiguous', sessionKeys: canonicalMatches.map((match) => match.sessionKey) };
}

export function resolvePreferredSessionKeyForSessionIdMatches(
  matches: Array<[string, SessionRecord]>,
  sessionId: string,
): string | undefined {
  const selection = resolveSessionIdMatchSelection(matches, sessionId);
  return selection.kind === 'selected' ? selection.sessionKey : undefined;
}

export function findExactSessionIdMatch(
  sessions: Map<string, SessionRecord>,
  sessionId: string,
): SessionRecord | undefined {
  const normalized = normalizeSessionId(sessionId);
  if (!normalized) return undefined;

  for (const record of sessions.values()) {
    if (record.id.toLowerCase() === normalized) {
      return record;
    }
  }
  return undefined;
}

export function findSessionsByIdSubstring(
  sessions: Map<string, SessionRecord>,
  idSubstring: string,
): Array<[string, SessionRecord]> {
  const normalized = idSubstring.trim().toLowerCase();
  if (!normalized) return [];

  const results: Array<[string, SessionRecord]> = [];
  for (const [key, record] of sessions) {
    if (record.id.toLowerCase().includes(normalized)) {
      results.push([key, record]);
    }
  }
  return results;
}

export function resolveSessionReference(
  sessions: Map<string, SessionRecord>,
  reference: string,
): SessionIdMatchSelection {
  const trimmed = reference.trim();
  if (!trimmed) {
    return { kind: 'none' };
  }

  if (looksLikeSessionId(trimmed)) {
    const exactMatch = findExactSessionIdMatch(sessions, trimmed);
    if (exactMatch) {
      return { kind: 'selected', sessionKey: exactMatch.key };
    }
  }

  const byKey: Array<[string, SessionRecord]> = [];
  const byIdSubstring = findSessionsByIdSubstring(sessions, trimmed);
  const lowerRef = trimmed.toLowerCase();

  for (const [key, record] of sessions) {
    if (key.toLowerCase().includes(lowerRef)) {
      byKey.push([key, record]);
    }
  }

  const allMatches = [...byKey, ...byIdSubstring];
  const uniqueMatches = Array.from(new Map(allMatches).entries());

  if (uniqueMatches.length === 0) {
    return { kind: 'none' };
  }

  return resolveSessionIdMatchSelection(uniqueMatches, trimmed);
}
