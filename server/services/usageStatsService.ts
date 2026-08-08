/**
 * 技能使用统计统一服务
 *
 * 统一三处独立扫描入口的数据源，提供带缓存的统一 API：
 * - getSkillUsageStats / getBatchSkillUsageStats（主统计，供 /api/skill-usage-stats）
 * - loadUsageEvents（推荐引擎）
 * - getUsageAnalytics（趋势分析）
 *
 * 缓存策略：
 * - 统计结果缓存 60 秒（session 文件变更时自动失效）
 * - 使用事件全量扫描结果缓存 60 秒
 * - 新增技能执行时通过 recordSkillUsage 主动刷新
 */

import { FileStorage } from '../storage/FileStorage.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface UsageStats {
  totalUses: number;
  lastUsedAt: string | null;
}

export interface SkillUsageEvent {
  skillId: string;
  timestamp: string;
  sessionId: string;
  userId?: string;
}

// ===================== 缓存 =====================

/** 统计结果缓存（skillId → UsageStats），TTL 60s */
let statsCache: Map<string, UsageStats> | null = null;
let statsCacheAt = 0;
const STATS_CACHE_TTL = 60_000;

/** 使用事件缓存（全量），TTL 60s */
let eventsCache: SkillUsageEvent[] | null = null;
let eventsCacheAt = 0;
const EVENTS_CACHE_TTL = 60_000;

/** 缓存版本号，技能执行时递增以强制刷新 */
let cacheVersion = 0;

/** 标记缓存失效（技能执行时调用） */
export function invalidateUsageStatsCache(): void {
  cacheVersion++;
  statsCache = null;
  eventsCache = null;
  logger.debug('[UsageStats] Cache invalidated');
}

// ===================== 核心扫描逻辑（统一实现） =====================

/**
 * 全量扫描会话文件，提取所有带 skillId 的消息事件
 *
 * 这是唯一的数据扫描入口，替代原先 dao/chat.ts 和 skillRecommender.ts 中的重复实现
 */
export function loadAllUsageEvents(): SkillUsageEvent[] {
  // 检查缓存
  if (eventsCache && Date.now() - eventsCacheAt < EVENTS_CACHE_TTL) {
    return eventsCache;
  }

  const events: SkillUsageEvent[] = [];

  try {
    const sessionIds = FileStorage.listSessionFiles();
    for (const sid of sessionIds) {
      try {
        const lines = FileStorage.readSessionLines(sid);
        const first = lines[0] as unknown;
        const messages: unknown[] = Array.isArray(first?.messages) ? first.messages : [];
        for (let i = 1; i < lines.length; i++) {
          const l = lines[i] as unknown;
          if (l && l.message) messages.push(l.message);
        }

        for (const msg of messages) {
          if (!msg.skillId) continue;
          events.push({
            skillId: msg.skillId,
            timestamp: msg.timestamp || '',
            sessionId: sid,
            userId: msg.userId || msg.sessionId || sid,
          });
        }
      } catch {
        // ignore per-session errors
      }
    }
  } catch (e) {
    logger.error('[UsageStats] loadAllUsageEvents failed:', e);
  }

  eventsCache = events;
  eventsCacheAt = Date.now();
  return events;
}

/**
 * 按时间窗口过滤使用事件（供推荐引擎使用）
 */
export function loadUsageEvents(days: number = 30): SkillUsageEvent[] {
  const allEvents = loadAllUsageEvents();
  if (days <= 0 || days >= 3650) return allEvents;

  const sinceMs = Date.now() - days * 86_400_000;
  return allEvents.filter((e) => {
    const tsMs = e.timestamp ? new Date(e.timestamp).getTime() : 0;
    return tsMs >= sinceMs;
  });
}

// ===================== 统计 API =====================

/**
 * 构建全量统计 Map（skillId → UsageStats）
 *
 * 内部使用缓存，60s TTL
 */
function buildStatsMap(): Map<string, UsageStats> {
  if (statsCache && Date.now() - statsCacheAt < STATS_CACHE_TTL) {
    return statsCache;
  }

  const events = loadAllUsageEvents();
  const map = new Map<string, UsageStats>();

  for (const e of events) {
    const existing = map.get(e.skillId);
    if (existing) {
      existing.totalUses++;
      if (!existing.lastUsedAt || e.timestamp > existing.lastUsedAt) {
        existing.lastUsedAt = e.timestamp;
      }
    } else {
      map.set(e.skillId, {
        totalUses: 1,
        lastUsedAt: e.timestamp || null,
      });
    }
  }

  statsCache = map;
  statsCacheAt = Date.now();
  return map;
}

/**
 * 获取单个技能的使用统计
 */
export function getSkillUsageStats(skillId: string): UsageStats {
  const map = buildStatsMap();
  return map.get(skillId) ?? { totalUses: 0, lastUsedAt: null };
}

/**
 * 批量获取多个技能的使用统计
 */
export function getBatchSkillUsageStats(skillIds: string[]): Map<string, UsageStats> {
  const map = buildStatsMap();
  const result = new Map<string, UsageStats>();

  for (const id of skillIds) {
    result.set(id, map.get(id) ?? { totalUses: 0, lastUsedAt: null });
  }

  return result;
}

/**
 * 获取所有技能的使用统计
 */
export function getAllSkillUsageStats(): Map<string, UsageStats> {
  return buildStatsMap();
}

// ===================== 技能执行时主动记录 =====================

/**
 * 记录技能使用（技能执行时调用）
 *
 * 同时刷新缓存，使下次查询立即反映最新数据
 */
export function recordSkillUsage(skillId: string, sessionId: string, timestamp?: string): void {
  // 消息写入 JSONL 由 chatService 负责，这里仅刷新缓存
  // 让下次查询重新扫描文件，确保数据一致
  invalidateUsageStatsCache();
  logger.debug(`[UsageStats] Recorded usage: ${skillId} in session ${sessionId}`);
}
