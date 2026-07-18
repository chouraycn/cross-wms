import type { Server as HttpServer } from 'node:http';
import { logger } from '../../logger.js';
import type { GatewayBroadcastFn, GatewayBroadcastToConnIdsFn } from './server-broadcast-types.js';
import type { RuntimeConfig } from './server-runtime-config.js';
import type { LiveState } from './server-live-state.js';
import { getRuntimeConfig } from './server-runtime-config.js';
import { getLiveState } from './server-live-state.js';

export type GatewayRuntimeState = {
  httpServer: HttpServer | null;
  httpServers: HttpServer[];
  httpBindHosts: string[];
  clients: Set<unknown>;
  broadcast: GatewayBroadcastFn;
  broadcastToConnIds: GatewayBroadcastToConnIdsFn;
  agentRunSeq: Map<string, number>;
  dedupe: Map<string, DedupeEntry>;
  chatRunBuffers: Map<string, string>;
  chatDeltaSentAt: Map<string, number>;
  chatDeltaLastBroadcastLen: Map<string, number>;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
  startedAt: number;
  getConfig: () => RuntimeConfig;
  getLiveState: () => LiveState;
};

export type DedupeEntry = {
  value: unknown;
  expiresAt: number;
};

export type ChatAbortControllerEntry = {
  controller: AbortController;
  sessionKey: string;
  createdAt: number;
};

function createNoopBroadcast(): GatewayBroadcastFn {
  return (_event: string, _payload: unknown, _opts?) => {
    // noop
  };
}

function createNoopBroadcastToConnIds(): GatewayBroadcastToConnIdsFn {
  return (_event: string, _payload: unknown, _connIds: ReadonlySet<string>, _opts?) => {
    // noop
  };
}

let runtimeState: GatewayRuntimeState | null = null;

export function createGatewayRuntimeState(params?: {
  httpServer?: HttpServer;
  httpServers?: HttpServer[];
  httpBindHosts?: string[];
  broadcast?: GatewayBroadcastFn;
  broadcastToConnIds?: GatewayBroadcastToConnIdsFn;
}): GatewayRuntimeState {
  const state: GatewayRuntimeState = {
    httpServer: params?.httpServer ?? null,
    httpServers: params?.httpServers ?? (params?.httpServer ? [params.httpServer] : []),
    httpBindHosts: params?.httpBindHosts ?? [],
    clients: new Set(),
    broadcast: params?.broadcast ?? createNoopBroadcast(),
    broadcastToConnIds: params?.broadcastToConnIds ?? createNoopBroadcastToConnIds(),
    agentRunSeq: new Map(),
    dedupe: new Map(),
    chatRunBuffers: new Map(),
    chatDeltaSentAt: new Map(),
    chatDeltaLastBroadcastLen: new Map(),
    chatAbortControllers: new Map(),
    startedAt: Date.now(),
    getConfig: getRuntimeConfig,
    getLiveState: getLiveState,
  };

  runtimeState = state;
  logger.info('[Gateway] Runtime state created');
  return state;
}

export function getGatewayRuntimeState(): GatewayRuntimeState | null {
  return runtimeState;
}

export function resetGatewayRuntimeState(): void {
  if (runtimeState) {
    runtimeState.chatAbortControllers.forEach((entry) => {
      try {
        entry.controller.abort();
      } catch {
        // ignore abort errors
      }
    });
  }
  runtimeState = null;
  logger.info('[Gateway] Runtime state reset');
}

export function getNextAgentRunSeq(sessionId: string): number {
  if (!runtimeState) {
    return 0;
  }
  const current = runtimeState.agentRunSeq.get(sessionId) ?? 0;
  const next = current + 1;
  runtimeState.agentRunSeq.set(sessionId, next);
  return next;
}

export function setDedupeEntry(key: string, value: unknown, ttlMs: number): void {
  if (!runtimeState) return;
  runtimeState.dedupe.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

export function getDedupeEntry(key: string): unknown | undefined {
  if (!runtimeState) return undefined;
  const entry = runtimeState.dedupe.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    runtimeState.dedupe.delete(key);
    return undefined;
  }
  return entry.value;
}

export function deleteDedupeEntry(key: string): boolean {
  if (!runtimeState) return false;
  return runtimeState.dedupe.delete(key);
}

export function cleanupExpiredDedupe(): number {
  if (!runtimeState) return 0;
  const now = Date.now();
  let removed = 0;
  for (const [key, entry] of runtimeState.dedupe) {
    if (entry.expiresAt < now) {
      runtimeState.dedupe.delete(key);
      removed++;
    }
  }
  return removed;
}

export function registerChatAbortController(
  sessionKey: string,
  controller: AbortController,
): string {
  if (!runtimeState) {
    return '';
  }
  const id = `${sessionKey}:${Date.now()}`;
  runtimeState.chatAbortControllers.set(id, {
    controller,
    sessionKey,
    createdAt: Date.now(),
  });
  return id;
}

export function unregisterChatAbortController(id: string): boolean {
  if (!runtimeState) return false;
  return runtimeState.chatAbortControllers.delete(id);
}

export function abortChatSession(sessionKey: string): boolean {
  if (!runtimeState) return false;
  let aborted = false;
  for (const [id, entry] of runtimeState.chatAbortControllers) {
    if (entry.sessionKey === sessionKey) {
      try {
        entry.controller.abort();
        aborted = true;
      } catch {
        // ignore abort errors
      }
      runtimeState.chatAbortControllers.delete(id);
    }
  }
  return aborted;
}

export function getChatRunBuffer(sessionId: string): string | undefined {
  return runtimeState?.chatRunBuffers.get(sessionId);
}

export function setChatRunBuffer(sessionId: string, content: string): void {
  runtimeState?.chatRunBuffers.set(sessionId, content);
}

export function deleteChatRunBuffer(sessionId: string): boolean {
  if (!runtimeState) return false;
  return runtimeState.chatRunBuffers.delete(sessionId);
}
