/**
 * Session Memory Sync Manager — 会话记忆同步管理器
 *
 * 参考 OpenClaw memory-search.ts 的 sync 配置设计，
 * 管理每个会话的记忆同步策略和执行。
 *
 * 同步策略：
 * - on_turn: 每轮对话结束后同步新增消息
 * - on_search: 搜索记忆时同步新增消息
 * - interval: 定时同步
 * - manual: 仅手动触发
 *
 * 特殊触发：
 * - postCompactionForce: 压缩完成后强制同步
 */

import { logger } from '../logger.js';
import { MemorySyncer, type MemorySyncConfig, type SyncableMessage } from './context-engine/memorySyncer.js';
import { getSessionMessages } from '../dao/chat.js';

// ===================== 类型定义 =====================

export type MemorySyncTrigger = 'on_turn' | 'on_search' | 'interval' | 'manual' | 'post_compaction';

export interface SessionMemorySyncManagerConfig {
  defaultStrategy: MemorySyncConfig['strategy'];
  minContentLength: number;
  includeSystemMessages: boolean;
  includeToolResults: boolean;
  intervalMs: number;
  batchSize: number;
  forceSyncAfterCompaction: boolean;
}

// ===================== 默认配置 =====================

const DEFAULT_CONFIG: SessionMemorySyncManagerConfig = {
  defaultStrategy: 'on_search',
  minContentLength: 10,
  includeSystemMessages: false,
  includeToolResults: false,
  intervalMs: 60_000,
  batchSize: 20,
  forceSyncAfterCompaction: true,
};

// ===================== 单例状态 =====================

let config: SessionMemorySyncManagerConfig = { ...DEFAULT_CONFIG };

/** 会话 ID → MemorySyncer 实例映射 */
const syncers = new Map<string, MemorySyncer>();

/** 全局是否启用记忆同步 */
let syncEnabled = true;

// ===================== 配置管理 =====================

/**
 * 配置会话记忆同步管理器
 */
export function configureSessionMemorySync(
  partialConfig: Partial<SessionMemorySyncManagerConfig>,
): void {
  config = { ...config, ...partialConfig };
  logger.info(`[SessionMemorySync] 配置已更新: strategy=${config.defaultStrategy}, enabled=${syncEnabled}`);
}

/**
 * 获取当前配置
 */
export function getSessionMemorySyncConfig(): Readonly<SessionMemorySyncManagerConfig> {
  return { ...config };
}

/**
 * 启用/禁用记忆同步
 */
export function setMemorySyncEnabled(enabled: boolean): void {
  syncEnabled = enabled;
  logger.info(`[SessionMemorySync] 记忆同步已${enabled ? '启用' : '禁用'}`);
}

/**
 * 检查是否启用
 */
export function isMemorySyncEnabled(): boolean {
  return syncEnabled;
}

// ===================== Syncer 管理 =====================

/**
 * 获取或创建会话的 MemorySyncer
 */
function getOrCreateSyncer(sessionId: string, agentId: string = 'default'): MemorySyncer | null {
  if (!syncEnabled) return null;

  let syncer = syncers.get(sessionId);
  if (syncer) return syncer;

  syncer = new MemorySyncer(sessionId, agentId, {
    strategy: config.defaultStrategy,
    minContentLength: config.minContentLength,
    includeSystemMessages: config.includeSystemMessages,
    includeToolResults: config.includeToolResults,
    intervalMs: config.intervalMs,
    batchSize: config.batchSize,
  });

  syncers.set(sessionId, syncer);

  // 异步初始化（不阻塞）
  syncer.init().catch((err) => {
    logger.warn(`[SessionMemorySync] 初始化失败 (session=${sessionId}):`, err instanceof Error ? err.message : String(err));
  });

  return syncer;
}

/**
 * 移除会话的 MemorySyncer（会话结束/归档时调用）
 */
export function removeSessionSyncer(sessionId: string): void {
  const syncer = syncers.get(sessionId);
  if (syncer) {
    syncer.dispose().catch(() => {});
    syncers.delete(sessionId);
    logger.debug(`[SessionMemorySync] 已移除会话 syncer: ${sessionId}`);
  }
}

/**
 * 从 DB 加载消息并转换为 SyncableMessage 格式
 */
function loadSyncableMessages(sessionId: string): SyncableMessage[] {
  try {
    const dbMessages = getSessionMessages(sessionId);
    return dbMessages.map((m: any) => ({
      id: m.id,
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now(),
    }));
  } catch (err) {
    logger.warn(`[SessionMemorySync] 加载会话消息失败:`, err instanceof Error ? err.message : String(err));
    return [];
  }
}

// ===================== 触发同步 =====================

/**
 * 触发对话轮次结束同步
 * 当策略为 on_turn 时生效
 */
export async function triggerTurnEndSync(sessionId: string, agentId: string = 'default'): Promise<number> {
  if (!syncEnabled) return 0;

  const syncer = getOrCreateSyncer(sessionId, agentId);
  if (!syncer) return 0;

  if (syncer.getStrategy() !== 'on_turn') return 0;

  try {
    const messages = loadSyncableMessages(sessionId);
    const synced = await syncer.syncNewMessages(messages);
    if (synced > 0) {
      logger.debug(`[SessionMemorySync] on_turn 同步完成: session=${sessionId}, count=${synced}`);
    }
    return synced;
  } catch (err) {
    logger.warn(`[SessionMemorySync] on_turn 同步失败:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/**
 * 触发搜索时同步
 * 当策略为 on_search 时生效
 */
export async function triggerSearchSync(sessionId: string, agentId: string = 'default'): Promise<number> {
  if (!syncEnabled) return 0;

  const syncer = getOrCreateSyncer(sessionId, agentId);
  if (!syncer) return 0;

  if (syncer.getStrategy() !== 'on_search') return 0;

  try {
    const messages = loadSyncableMessages(sessionId);
    const synced = await syncer.syncNewMessages(messages);
    if (synced > 0) {
      logger.debug(`[SessionMemorySync] on_search 同步完成: session=${sessionId}, count=${synced}`);
    }
    return synced;
  } catch (err) {
    logger.warn(`[SessionMemorySync] on_search 同步失败:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/**
 * 触发压缩后强制同步
 * 不受策略限制，只要 forceSyncAfterCompaction 为 true 就执行
 */
export async function triggerPostCompactionSync(sessionId: string, agentId: string = 'default'): Promise<number> {
  if (!syncEnabled || !config.forceSyncAfterCompaction) return 0;

  const syncer = getOrCreateSyncer(sessionId, agentId);
  if (!syncer) return 0;

  try {
    const messages = loadSyncableMessages(sessionId);
    // 压缩后重置 lastSyncedIndex，全量检查同步
    syncer.setLastSyncedIndex(-1);
    const synced = await syncer.syncNewMessages(messages);
    if (synced > 0) {
      logger.debug(`[SessionMemorySync] post_compaction 同步完成: session=${sessionId}, count=${synced}`);
    }
    return synced;
  } catch (err) {
    logger.warn(`[SessionMemorySync] post_compaction 同步失败:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/**
 * 手动触发全量同步
 */
export async function triggerManualSync(sessionId: string, agentId: string = 'default'): Promise<number> {
  if (!syncEnabled) return 0;

  const syncer = getOrCreateSyncer(sessionId, agentId);
  if (!syncer) return 0;

  try {
    const messages = loadSyncableMessages(sessionId);
    const synced = await syncer.syncAll(messages);
    logger.info(`[SessionMemorySync] manual 同步完成: session=${sessionId}, count=${synced}`);
    return synced;
  } catch (err) {
    logger.warn(`[SessionMemorySync] manual 同步失败:`, err instanceof Error ? err.message : String(err));
    return 0;
  }
}

/**
 * 切换同步策略
 */
export function setSessionSyncStrategy(
  sessionId: string,
  strategy: MemorySyncConfig['strategy'],
  agentId: string = 'default',
): void {
  const syncer = getOrCreateSyncer(sessionId, agentId);
  if (syncer) {
    syncer.setStrategy(strategy);
    logger.debug(`[SessionMemorySync] 策略已切换: session=${sessionId}, strategy=${strategy}`);
  }
}

/**
 * 获取会话同步统计
 */
export function getSessionSyncStats(sessionId: string, agentId: string = 'default'): ReturnType<MemorySyncer['getStats']> | null {
  const syncer = syncers.get(sessionId);
  if (!syncer) return null;
  return syncer.getStats();
}

/**
 * 清理所有 syncer（服务关闭时调用）
 */
export async function disposeAllSyncers(): Promise<void> {
  for (const [sessionId, syncer] of syncers) {
    try {
      await syncer.dispose();
    } catch {
      // ignore
    }
  }
  syncers.clear();
  logger.info('[SessionMemorySync] 所有 syncer 已清理');
}
