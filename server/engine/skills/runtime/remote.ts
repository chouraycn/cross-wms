import { logger } from "../../../logger.js";

export type RemoteSkillNodeStatus = "online" | "offline" | "syncing";
export type RemoteSkillSyncStatus = "synced" | "pending" | "failed";

export interface RemoteSkillNode {
  nodeId: string;
  nodeUrl: string;
  nodeName?: string;
  status: RemoteSkillNodeStatus;
  lastSeen: number;
  skillCount: number;
}

export interface RemoteSkill {
  nodeId: string;
  skillName: string;
  version: string;
  metadata: Record<string, unknown>;
  syncStatus: RemoteSkillSyncStatus;
}

export interface RemoteSyncConfig {
  enabled: boolean;
  nodes: RemoteSkillNode[];
  syncIntervalMs: number;
  autoPull: boolean;
}

export interface SyncResult {
  nodeId: string;
  syncedSkills: string[];
  failedSkills: string[];
  durationMs: number;
  error?: string;
}

interface RemoteState {
  nodes: Map<string, RemoteSkillNode>;
  skills: Map<string, RemoteSkill>;
  config: RemoteSyncConfig;
  syncTimer: ReturnType<typeof setInterval> | null;
  isSyncing: boolean;
}

const DEFAULT_SYNC_INTERVAL_MS = 60_000;
const MIN_SYNC_INTERVAL_MS = 10_000;
const MOCK_DELAY_MIN_MS = 100;
const MOCK_DELAY_MAX_MS = 500;

const state: RemoteState = {
  nodes: new Map(),
  skills: new Map(),
  config: {
    enabled: false,
    nodes: [],
    syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
    autoPull: false,
  },
  syncTimer: null,
  isSyncing: false,
};

function skillKey(nodeId: string, skillName: string): string {
  return `${nodeId}:${skillName}`;
}

function mockDelay(): Promise<void> {
  const delay =
    Math.floor(Math.random() * (MOCK_DELAY_MAX_MS - MOCK_DELAY_MIN_MS)) + MOCK_DELAY_MIN_MS;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

function buildMockSkills(nodeId: string): RemoteSkill[] {
  const mockPool: Array<{ name: string; version: string; metadata: Record<string, unknown> }> = [
    { name: "remote-chat", version: "1.0.0", metadata: { category: "chat", author: "node-team" } },
    { name: "remote-search", version: "2.1.0", metadata: { category: "search", author: "node-team" } },
    { name: "remote-translate", version: "1.2.3", metadata: { category: "i18n", author: "lang-team" } },
    { name: "remote-summarize", version: "0.9.0", metadata: { category: "nlp", author: "ai-team" } },
    { name: "remote-codegen", version: "3.0.0-beta", metadata: { category: "code", author: "dev-team" } },
  ];
  const count = 3 + Math.floor(Math.random() * 3);
  const shuffled = [...mockPool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map((s) => ({
    nodeId,
    skillName: s.name,
    version: s.version,
    metadata: s.metadata,
    syncStatus: "pending" as const,
  }));
}

export function registerRemoteNode(node: Omit<RemoteSkillNode, "lastSeen" | "skillCount" | "status"> & {
  status?: RemoteSkillNodeStatus;
  lastSeen?: number;
  skillCount?: number;
}): RemoteSkillNode {
  if (state.nodes.has(node.nodeId)) {
    logger.warn(`[RemoteSkills] Node already registered: ${node.nodeId}, updating`);
  }

  const newNode: RemoteSkillNode = {
    nodeId: node.nodeId,
    nodeUrl: node.nodeUrl,
    nodeName: node.nodeName,
    status: node.status ?? "offline",
    lastSeen: node.lastSeen ?? 0,
    skillCount: node.skillCount ?? 0,
  };

  state.nodes.set(node.nodeId, newNode);
  logger.info(
    `[RemoteSkills] Registered node: ${node.nodeId} (${node.nodeName ?? node.nodeUrl})`,
  );
  return { ...newNode };
}

export function unregisterRemoteNode(nodeId: string): boolean {
  const existed = state.nodes.has(nodeId);
  if (!existed) {
    logger.warn(`[RemoteSkills] Cannot unregister - node not found: ${nodeId}`);
    return false;
  }

  state.nodes.delete(nodeId);
  const keysToDelete: string[] = [];
  for (const [key, skill] of state.skills) {
    if (skill.nodeId === nodeId) {
      keysToDelete.push(key);
    }
  }
  for (const key of keysToDelete) {
    state.skills.delete(key);
  }

  logger.info(`[RemoteSkills] Unregistered node: ${nodeId} (removed ${keysToDelete.length} skills)`);
  return true;
}

export function listRemoteNodes(): RemoteSkillNode[] {
  return Array.from(state.nodes.values()).map((n) => ({ ...n }));
}

export function updateRemoteNodeStatus(
  nodeId: string,
  status: RemoteSkillNodeStatus,
): RemoteSkillNode | null {
  const node = state.nodes.get(nodeId);
  if (!node) {
    logger.warn(`[RemoteSkills] Cannot update status - node not found: ${nodeId}`);
    return null;
  }

  node.status = status;
  if (status === "online" || status === "syncing") {
    node.lastSeen = Date.now();
  }

  logger.debug(`[RemoteSkills] Node ${nodeId} status updated: ${status}`);
  return { ...node };
}

export async function syncSkillsFromNode(nodeId: string): Promise<SyncResult> {
  const startTime = Date.now();
  const node = state.nodes.get(nodeId);

  if (!node) {
    const durationMs = Date.now() - startTime;
    logger.error(`[RemoteSkills] Sync failed - node not found: ${nodeId}`);
    return {
      nodeId,
      syncedSkills: [],
      failedSkills: [],
      durationMs,
      error: `Node not found: ${nodeId}`,
    };
  }

  updateRemoteNodeStatus(nodeId, "syncing");
  logger.info(`[RemoteSkills] Starting sync from node: ${nodeId}`);

  try {
    await mockDelay();

    const shouldFail = Math.random() < 0.1;
    if (shouldFail) {
      throw new Error(`Simulated network error for node ${nodeId}`);
    }

    const remoteSkills = buildMockSkills(nodeId);
    const syncedSkills: string[] = [];
    const failedSkills: string[] = [];

    for (const skill of remoteSkills) {
      const failSkill = Math.random() < 0.05;
      if (failSkill) {
        failedSkills.push(skill.skillName);
        const key = skillKey(nodeId, skill.skillName);
        const existing = state.skills.get(key);
        state.skills.set(key, {
          ...skill,
          syncStatus: "failed",
          metadata: existing?.metadata ?? skill.metadata,
          version: existing?.version ?? skill.version,
        });
      } else {
        const key = skillKey(nodeId, skill.skillName);
        state.skills.set(key, {
          ...skill,
          syncStatus: "synced",
        });
        syncedSkills.push(skill.skillName);
      }
    }

    node.skillCount = syncedSkills.length + failedSkills.length;
    node.lastSeen = Date.now();
    node.status = "online";

    const durationMs = Date.now() - startTime;
    logger.info(
      `[RemoteSkills] Sync complete for node ${nodeId}: ${syncedSkills.length} synced, ${failedSkills.length} failed (${durationMs}ms)`,
    );

    return {
      nodeId,
      syncedSkills: syncedSkills.sort(),
      failedSkills: failedSkills.sort(),
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    node.status = "offline";
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error(`[RemoteSkills] Sync failed for node ${nodeId}:`, err);

    return {
      nodeId,
      syncedSkills: [],
      failedSkills: [],
      durationMs,
      error: errorMessage,
    };
  }
}

export async function syncAllRemoteNodes(): Promise<SyncResult[]> {
  if (state.isSyncing) {
    logger.warn("[RemoteSkills] Sync already in progress, skipping");
    return [];
  }

  state.isSyncing = true;
  const startTime = Date.now();

  try {
    const nodeIds = Array.from(state.nodes.keys());
    const results: SyncResult[] = [];

    for (const nodeId of nodeIds) {
      const result = await syncSkillsFromNode(nodeId);
      results.push(result);
    }

    const totalSynced = results.reduce((sum, r) => sum + r.syncedSkills.length, 0);
    const totalFailed = results.reduce((sum, r) => sum + r.failedSkills.length, 0);
    const durationMs = Date.now() - startTime;

    logger.info(
      `[RemoteSkills] All nodes sync complete: ${results.length} nodes, ${totalSynced} synced, ${totalFailed} failed (${durationMs}ms)`,
    );

    return results;
  } finally {
    state.isSyncing = false;
  }
}

export function getRemoteSkills(nodeId?: string): RemoteSkill[] {
  const all = Array.from(state.skills.values());
  if (nodeId) {
    return all.filter((s) => s.nodeId === nodeId).map((s) => ({ ...s }));
  }
  return all.map((s) => ({ ...s }));
}

export async function pullRemoteSkill(
  nodeId: string,
  skillName: string,
): Promise<RemoteSkill | null> {
  const node = state.nodes.get(nodeId);
  if (!node) {
    logger.warn(`[RemoteSkills] Cannot pull skill - node not found: ${nodeId}`);
    return null;
  }

  logger.debug(`[RemoteSkills] Pulling skill ${skillName} from node ${nodeId}`);
  await mockDelay();

  const key = skillKey(nodeId, skillName);
  const existing = state.skills.get(key);

  if (existing) {
    const updated: RemoteSkill = {
      ...existing,
      syncStatus: "synced",
      version: existing.version,
    };
    state.skills.set(key, updated);
    return { ...updated };
  }

  const newSkill: RemoteSkill = {
    nodeId,
    skillName,
    version: "1.0.0",
    metadata: { pulled: true, pulledAt: Date.now() },
    syncStatus: "synced",
  };
  state.skills.set(key, newSkill);

  logger.info(`[RemoteSkills] Pulled skill ${skillName} from node ${nodeId}`);
  return { ...newSkill };
}

export async function loadRemoteSkill(
  nodeId: string,
  skillName: string,
): Promise<RemoteSkill | null> {
  const key = skillKey(nodeId, skillName);
  const skill = state.skills.get(key);

  if (skill && skill.syncStatus === "synced") {
    logger.debug(`[RemoteSkills] Loading cached skill ${skillName} from node ${nodeId}`);
    return { ...skill };
  }

  logger.info(`[RemoteSkills] Skill ${skillName} not synced, pulling from node ${nodeId}`);
  return pullRemoteSkill(nodeId, skillName);
}

export function startRemoteSync(config: Partial<RemoteSyncConfig> = {}): () => void {
  if (state.syncTimer) {
    logger.warn("[RemoteSkills] Stopping existing sync timer before starting new one");
    stopRemoteSync();
  }

  const intervalMs = config.syncIntervalMs
    ? Math.max(config.syncIntervalMs, MIN_SYNC_INTERVAL_MS)
    : DEFAULT_SYNC_INTERVAL_MS;

  if (config.syncIntervalMs && config.syncIntervalMs < MIN_SYNC_INTERVAL_MS) {
    logger.warn(
      `[RemoteSkills] Sync interval ${config.syncIntervalMs}ms is below minimum ${MIN_SYNC_INTERVAL_MS}ms, using minimum`,
    );
  }

  state.config = {
    enabled: true,
    nodes: config.nodes ?? [],
    syncIntervalMs: intervalMs,
    autoPull: config.autoPull ?? false,
  };

  for (const node of state.config.nodes) {
    registerRemoteNode(node);
  }

  let running = true;

  logger.info(`[RemoteSkills] Starting remote sync (interval=${intervalMs}ms)`);

  const timerId = setInterval(() => {
    if (!running) return;
    void syncAllRemoteNodes();
  }, intervalMs);

  state.syncTimer = timerId;

  return function stop() {
    if (!running) return;
    running = false;
    if (state.syncTimer === timerId) {
      clearInterval(timerId);
      state.syncTimer = null;
      state.config.enabled = false;
    }
    logger.info("[RemoteSkills] Remote sync stopped");
  };
}

export function stopRemoteSync(): void {
  if (state.syncTimer) {
    clearInterval(state.syncTimer);
    state.syncTimer = null;
    state.config.enabled = false;
    logger.info("[RemoteSkills] Remote sync stopped");
  } else {
    logger.debug("[RemoteSkills] No active sync timer to stop");
  }
}

export function isRemoteSkill(skillName: string): boolean {
  for (const skill of state.skills.values()) {
    if (skill.skillName === skillName) {
      return true;
    }
  }
  return false;
}

export function getRemoteSkillNode(skillName: string): RemoteSkillNode | null {
  for (const skill of state.skills.values()) {
    if (skill.skillName === skillName) {
      const node = state.nodes.get(skill.nodeId);
      return node ? { ...node } : null;
    }
  }
  return null;
}

export function resetRemoteState(): void {
  stopRemoteSync();
  state.nodes.clear();
  state.skills.clear();
  state.config = {
    enabled: false,
    nodes: [],
    syncIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
    autoPull: false,
  };
  state.isSyncing = false;
}

export function getRemoteSyncConfig(): RemoteSyncConfig {
  return {
    ...state.config,
    nodes: state.config.nodes.map((n) => ({ ...n })),
  };
}
