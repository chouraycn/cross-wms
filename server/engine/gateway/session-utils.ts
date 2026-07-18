import { logger } from '../../logger.js';
import type {
  GatewaySessionRow,
  GatewaySessionsDefaults,
  SessionsListResult,
} from './session-utils.types.js';
import { getChildSessionKeys } from './session-child-sessions.js';
import { getCompactionCheckpointCount, getLatestCompactionCheckpoint } from './session-compaction-checkpoints.js';

export type LoadSessionEntryResult = {
  entry: Record<string, unknown> | null;
  storePath: string;
  canonicalKey: string;
};

export type SessionStore = Record<string, Record<string, unknown>>;

const sessionStore: SessionStore = {};

export function getSessionStore(): SessionStore {
  return sessionStore;
}

export function getSessionEntry(sessionKey: string): Record<string, unknown> | undefined {
  return sessionStore[sessionKey];
}

export function setSessionEntry(sessionKey: string, entry: Record<string, unknown>): void {
  sessionStore[sessionKey] = entry;
}

export function deleteSessionEntry(sessionKey: string): boolean {
  return delete sessionStore[sessionKey];
}

export function hasSessionEntry(sessionKey: string): boolean {
  return sessionKey in sessionStore;
}

export function listSessionKeys(): string[] {
  return Object.keys(sessionStore);
}

export function loadSessionEntry(
  sessionKey: string,
  options?: { agentId?: string; clone?: boolean },
): LoadSessionEntryResult {
  const entry = sessionStore[sessionKey] ?? null;
  return {
    entry: options?.clone !== false && entry ? structuredClone(entry) : entry,
    storePath: '',
    canonicalKey: sessionKey,
  };
}

export function buildGatewaySessionRow(
  sessionKey: string,
  entry: Record<string, unknown>,
): GatewaySessionRow {
  const childSessions = getChildSessionKeys(sessionKey);
  const compactionCheckpointCount = getCompactionCheckpointCount(sessionKey);
  const latestCheckpoint = getLatestCompactionCheckpoint(sessionKey);

  return {
    key: sessionKey,
    kind: (entry.kind as GatewaySessionRow['kind']) ?? 'unknown',
    updatedAt: typeof entry.updatedAt === 'number' ? entry.updatedAt : null,
    sessionId: typeof entry.sessionId === 'string' ? entry.sessionId : undefined,
    label: typeof entry.label === 'string' ? entry.label : undefined,
    displayName: typeof entry.displayName === 'string' ? entry.displayName : undefined,
    derivedTitle: typeof entry.derivedTitle === 'string' ? entry.derivedTitle : undefined,
    lastMessagePreview:
      typeof entry.lastMessagePreview === 'string' ? entry.lastMessagePreview : undefined,
    channel: typeof entry.channel === 'string' ? entry.channel : undefined,
    modelProvider:
      typeof entry.modelProvider === 'string' ? entry.modelProvider : undefined,
    model: typeof entry.model === 'string' ? entry.model : undefined,
    agentRuntime: typeof entry.agentRuntime === 'string' ? entry.agentRuntime : undefined,
    status: (entry.status as GatewaySessionRow['status']) ?? undefined,
    startedAt: typeof entry.startedAt === 'number' ? entry.startedAt : undefined,
    endedAt: typeof entry.endedAt === 'number' ? entry.endedAt : undefined,
    runtimeMs: typeof entry.runtimeMs === 'number' ? entry.runtimeMs : undefined,
    inputTokens: typeof entry.inputTokens === 'number' ? entry.inputTokens : undefined,
    outputTokens: typeof entry.outputTokens === 'number' ? entry.outputTokens : undefined,
    totalTokens: typeof entry.totalTokens === 'number' ? entry.totalTokens : undefined,
    estimatedCostUsd:
      typeof entry.estimatedCostUsd === 'number' ? entry.estimatedCostUsd : undefined,
    childSessions,
    parentSessionKey:
      typeof entry.parentSessionKey === 'string' ? entry.parentSessionKey : undefined,
    compactionCheckpointCount,
    latestCompactionCheckpoint: latestCheckpoint
      ? {
          checkpointId: latestCheckpoint.checkpointId,
          createdAt: latestCheckpoint.createdAt,
          reason: latestCheckpoint.reason,
        }
      : undefined,
    hasActiveRun: entry.status === 'running',
    abortedLastRun: Boolean(entry.abortedLastRun),
  };
}

export function listSessions(params: {
  limit?: number;
  offset?: number;
  sortBy?: 'updatedAt' | 'createdAt' | 'label';
  sortOrder?: 'asc' | 'desc';
  filter?: {
    kind?: string;
    status?: string;
    channel?: string;
    search?: string;
  };
}): SessionsListResult {
  const { limit = 50, offset = 0, sortBy = 'updatedAt', sortOrder = 'desc', filter } = params;

  const defaults: GatewaySessionsDefaults = {
    modelProvider: null,
    model: null,
    contextTokens: null,
  };

  let rows = Object.entries(sessionStore).map(([key, entry]) =>
    buildGatewaySessionRow(key, entry),
  );

  if (filter) {
    rows = rows.filter((row) => {
      if (filter.kind && row.kind !== filter.kind) return false;
      if (filter.status && row.status !== filter.status) return false;
      if (filter.channel && row.channel !== filter.channel) return false;
      if (filter.search) {
        const searchLower = filter.search.toLowerCase();
        const haystack = [row.label, row.displayName, row.derivedTitle, row.lastMessagePreview]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(searchLower)) return false;
      }
      return true;
    });
  }

  rows.sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;

    if (sortBy === 'updatedAt') {
      aVal = a.updatedAt ?? 0;
      bVal = b.updatedAt ?? 0;
    } else if (sortBy === 'label') {
      aVal = a.label ?? '';
      bVal = b.label ?? '';
    }

    if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const total = rows.length;
  const paginatedRows = rows.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return {
    ts: Date.now(),
    defaults,
    total,
    rows: paginatedRows,
    hasMore,
    cursor: hasMore ? String(offset + limit) : undefined,
  };
}

export function loadCombinedSessionStoreForGateway(
  _cfg: Record<string, unknown>,
): { store: SessionStore; storePath: string } {
  return {
    store: sessionStore,
    storePath: '',
  };
}

export function resolveGatewaySessionStoreTarget(params: {
  cfg: Record<string, unknown>;
  key: string;
  store: SessionStore;
}): { agentId: string; storePath: string } {
  const entry = params.store[params.key];
  return {
    agentId: typeof entry?.agentId === 'string' ? entry.agentId : 'default',
    storePath: '',
  };
}

export function resolveSessionTranscriptCandidates(
  _sessionId: string,
  _storePath: string,
  _sessionFile: string | undefined,
  _agentId: string,
): string[] {
  return [];
}

export function resolvePreferredSessionKeyForSessionIdMatches(
  matches: Array<[string, Record<string, unknown>]>,
  _sessionId: string,
): string | undefined {
  if (matches.length === 0) return undefined;
  return matches[0]?.[0];
}

export function clearSessionStoreForTests(): void {
  for (const key of Object.keys(sessionStore)) {
    delete sessionStore[key];
  }
}
