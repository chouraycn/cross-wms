// 移植自 openclaw/src/infra/system-presence.ts
// 降级：presence 存储/网络依赖简化

export type SystemPresence = {
  agentId?: string;
  status?: "online" | "away" | "offline" | "busy";
  lastSeenMs?: number;
  channels?: string[];
  [key: string]: unknown;
};

const presenceStore = new Map<string, SystemPresence>();

/** Updates system presence for an agent. */
export function updateSystemPresence(params: {
  agentId: string;
  status?: "online" | "away" | "offline" | "busy";
  channels?: string[];
}): SystemPresence {
  const existing = presenceStore.get(params.agentId) ?? {};
  const updated: SystemPresence = {
    ...existing,
    agentId: params.agentId,
    status: params.status ?? existing.status ?? "online",
    lastSeenMs: Date.now(),
    channels: params.channels ?? existing.channels ?? [],
  };
  presenceStore.set(params.agentId, updated);
  return updated;
}

/** Upserts presence entry. */
export function upsertPresence(params: {
  agentId: string;
  status?: "online" | "away" | "offline" | "busy";
  channels?: string[];
}): SystemPresence {
  return updateSystemPresence(params);
}

/** Lists all system presence entries. */
export function listSystemPresence(): SystemPresence[] {
  return [...presenceStore.values()];
}
