// Feishu plugin module implements dedup behavior for cross-wms.
import type { FeishuConfig, ResolvedFeishuAccount } from "./types.js";

type FeishuDedupEntry = {
  messageId: string;
  claimedAt: number;
  finalizedAt?: number;
  persistent?: boolean;
};

const dedupStore = new Map<string, FeishuDedupEntry>();
const DEDUP_DEFAULT_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEDUP_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

let lastCleanup = Date.now();

function maybeCleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < DEDUP_CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  const expiredKeys: string[] = [];
  for (const [key, entry] of dedupStore) {
    if (entry.finalizedAt && now - entry.finalizedAt > DEDUP_DEFAULT_TTL_MS) {
      expiredKeys.push(key);
    } else if (!entry.finalizedAt && now - entry.claimedAt > DEDUP_DEFAULT_TTL_MS * 2) {
      expiredKeys.push(key);
    }
  }
  for (const key of expiredKeys) {
    dedupStore.delete(key);
  }
}

function toDedupKey(messageId: string, accountId?: string): string {
  return accountId ? `${accountId}:${messageId}` : messageId;
}

export async function claimUnprocessedFeishuMessage(params: {
  messageId: string; accountId?: string;
}): Promise<{ claimed: boolean; alreadyProcessed: boolean }> {
  maybeCleanup();
  const key = toDedupKey(params.messageId, params.accountId);
  const existing = dedupStore.get(key);
  if (existing) {
    return { claimed: false, alreadyProcessed: !!existing.finalizedAt };
  }
  dedupStore.set(key, { messageId: params.messageId, claimedAt: Date.now() });
  return { claimed: true, alreadyProcessed: false };
}

export async function finalizeFeishuMessageProcessing(params: {
  messageId: string; accountId?: string;
}): Promise<void> {
  const key = toDedupKey(params.messageId, params.accountId);
  const entry = dedupStore.get(key);
  if (entry) {
    entry.finalizedAt = Date.now();
  }
}

export async function recordProcessedFeishuMessage(params: {
  messageId: string; accountId?: string;
}): Promise<void> {
  const key = toDedupKey(params.messageId, params.accountId);
  dedupStore.set(key, { messageId: params.messageId, claimedAt: Date.now(), finalizedAt: Date.now() });
}

export async function forgetProcessedFeishuMessage(params: {
  messageId: string; accountId?: string;
}): Promise<void> {
  const key = toDedupKey(params.messageId, params.accountId);
  dedupStore.delete(key);
}

export async function hasProcessedFeishuMessage(params: {
  messageId: string; accountId?: string;
}): Promise<boolean> {
  const key = toDedupKey(params.messageId, params.accountId);
  const entry = dedupStore.get(key);
  return !!entry?.finalizedAt;
}

export async function tryRecordMessagePersistent(params: {
  messageId: string; accountId?: string;
}): Promise<{ recorded: boolean }> {
  const key = toDedupKey(params.messageId, params.accountId);
  const entry = dedupStore.get(key);
  if (entry) {
    entry.persistent = true;
    return { recorded: true };
  }
  dedupStore.set(key, { messageId: params.messageId, claimedAt: Date.now(), finalizedAt: Date.now(), persistent: true });
  return { recorded: true };
}

export async function warmupDedupFromPluginState(params: {
  state?: Map<string, unknown>; accountId?: string;
}): Promise<{ warmed: number }> {
  if (!params.state) return { warmed: 0 };
  let warmed = 0;
  const prefix = params.accountId ? `${params.accountId}:` : "";
  for (const [key, value] of params.state) {
    if (key.startsWith(prefix) && typeof value === "object" && value !== null && "messageId" in value) {
      const entry = value as FeishuDedupEntry;
      if (!dedupStore.has(key)) {
        dedupStore.set(key, entry);
        warmed++;
      }
    }
  }
  return { warmed };
}

export const dedupTesting = {
  getStore: () => dedupStore,
  clear: () => dedupStore.clear(),
  size: () => dedupStore.size,
};
