/**
 * ACP Runtime Session Meta
 * 会话元数据存储 - 管理 ACP 会话的运行时元数据
 *
 * 参考 openclaw/src/acp/runtime/session-meta.ts 设计（简化版，内存存储）
 */

export type SessionAcpIdentity = {
  agent?: string;
  accountId?: string;
  conversationId?: string;
};

export type AcpSessionRuntimeOptions = {
  cwd?: string;
  model?: string;
  temperature?: number;
};

export type SessionAcpMeta = {
  backend?: string;
  agent?: string;
  runtimeSessionName?: string;
  identity?: SessionAcpIdentity;
  mode?: "persistent" | "oneshot";
  runtimeOptions?: AcpSessionRuntimeOptions;
  cwd?: string;
  state?: "idle" | "running" | "error";
  lastActivityAt?: number;
  lastError?: string;
};

export type AcpSessionStoreEntry = {
  sessionKey: string;
  acp?: SessionAcpMeta;
};

const acpSessionMetaStore = new Map<string, SessionAcpMeta>();

export function readAcpSessionMeta(sessionKey: string): SessionAcpMeta | undefined {
  const key = sessionKey.trim().toLowerCase();
  if (!key) {
    return undefined;
  }
  return acpSessionMetaStore.get(key);
}

export function writeAcpSessionMeta(sessionKey: string, meta: SessionAcpMeta): void {
  const key = sessionKey.trim().toLowerCase();
  if (!key) {
    return;
  }
  acpSessionMetaStore.set(key, {
    ...meta,
    lastActivityAt: meta.lastActivityAt ?? Date.now(),
  });
}

export function deleteAcpSessionMeta(sessionKey: string): void {
  const key = sessionKey.trim().toLowerCase();
  if (!key) {
    return;
  }
  acpSessionMetaStore.delete(key);
}

export function listAcpSessionEntries(): AcpSessionStoreEntry[] {
  const entries: AcpSessionStoreEntry[] = [];
  for (const [sessionKey, acp] of acpSessionMetaStore.entries()) {
    entries.push({ sessionKey, acp });
  }
  return entries.sort((a, b) => (b.acp?.lastActivityAt ?? 0) - (a.acp?.lastActivityAt ?? 0));
}

export async function upsertAcpSessionMeta(
  sessionKey: string,
  mutate: (current: SessionAcpMeta | undefined) => SessionAcpMeta | null | undefined,
): Promise<SessionAcpMeta | null> {
  const key = sessionKey.trim().toLowerCase();
  if (!key) {
    return null;
  }
  const current = acpSessionMetaStore.get(key);
  const nextMeta = mutate(current);
  if (nextMeta === undefined) {
    return current ?? null;
  }
  if (nextMeta === null) {
    acpSessionMetaStore.delete(key);
    return null;
  }
  acpSessionMetaStore.set(key, {
    ...nextMeta,
    lastActivityAt: nextMeta.lastActivityAt ?? Date.now(),
  });
  return nextMeta;
}

export const testing = {
  resetAcpSessionMetaForTests() {
    acpSessionMetaStore.clear();
  },
};
export { testing as __testing };