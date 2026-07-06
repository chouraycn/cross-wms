/**
 * v6.0: 会话生命周期管理器
 *
 * 职责：
 * 1. 每日自动创建新 Session（基于日期）
 * 2. 60 分钟无交互后自动归档
 * 3. 归档会话可搜索、可恢复
 * 4. 子任务自动创建子 Session
 *
 * v9.0: 全面重构为 FileStorage（JSONL）存储层
 */

import { type Session, type SessionStatus } from '../db.js';
import { v4 as uuidv4 } from 'uuid';
import { writeMemory, extractKeywords } from '../engine/vecMemoryStore.js';
import { logger } from '../logger.js';
import { FileStorage } from '../storage/FileStorage.js';
import { TimerManager } from '../core/timerManager.js';
import {
  getSessions as daoGetSessions,
  getArchivedSessions as daoGetArchivedSessions,
  archiveSessionInStorage,
  restoreSessionFromStorage,
  searchArchivedSessions as daoSearchArchivedSessions,
  deleteArchivedSession as daoDeleteArchivedSession,
} from '../dao/chat.js';

// ===================== 常量 =====================

/** 空闲归档阈值（毫秒）：60 分钟 */
const IDLE_ARCHIVE_THRESHOLD_MS = 60 * 60 * 1000;

/** 空闲检测间隔（毫秒）：5 分钟 */
const IDLE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** 每日重置检测间隔（毫秒）：30 秒 */
const DAILY_RESET_CHECK_INTERVAL_MS = 30 * 1000;

/** 归档时自动生成摘要的最大消息数 */
const SUMMARY_MAX_MESSAGES = 10;

// ===================== JSONL 辅助函数 =====================

/**
 * 从 JSONL 文件中解析会话和消息数据。
 * 第 0 行包含 { session, messages }，后续每行为 { message }。
 */
function parseSessionFile(sessionId: string): { session: Session | null; messages: Array<{ role: string; content: string; timestamp?: string }> } {
  try {
    const lines = FileStorage.readSessionLines(sessionId);
    if (lines.length === 0) return { session: null, messages: [] };

    const firstLine = lines[0] as any;
    const session = firstLine.session as Session;
    const initialMessages = (firstLine.messages || []) as Array<{ role: string; content: string; timestamp?: string }>;

    const subsequentMessages: Array<{ role: string; content: string; timestamp?: string }> = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i] as any;
      if (line.message) {
        subsequentMessages.push(line.message as { role: string; content: string; timestamp?: string });
      }
    }

    return { session, messages: [...initialMessages, ...subsequentMessages] };
  } catch {
    return { session: null, messages: [] };
  }
}

/** 重写会话文件的第一行（修改 session 元数据时调用）
 *  直接使用 FileStorage.rewriteSessionFirstLine，避免全文件读写
 */
function rewriteSessionFirstLine(sessionId: string, mutate: (firstLine: any) => void): boolean {
  try {
    const firstLine = FileStorage.readSessionFirstLine(sessionId) as any;
    if (!firstLine || !firstLine.session) return false;
    mutate(firstLine);
    FileStorage.rewriteSessionFirstLine(sessionId, firstLine);
    return true;
  } catch (e) {
    logger.error('[SessionLifecycle] rewriteSessionFirstLine 失败:', e);
    return false;
  }
}

/** 遍历所有会话文件，返回 session + messages */
function* iterateAllSessions(): Generator<{ session: Session; messages: Array<{ role: string; content: string }>; sessionId: string }> {
  const sessionIds = FileStorage.listSessionFiles();
  for (const id of sessionIds) {
    const { session, messages } = parseSessionFile(id);
    if (session) {
      (session as any).messageCount = messages.length;
      yield { session, messages, sessionId: id };
    }
  }
}

// ===================== DAO 扩展 =====================

/** 获取所有活跃会话（使用 DAO 层高效实现，只读第一行） */
export function getActiveSessions(): Session[] {
  return daoGetSessions();
}

/** 获取所有归档会话（从归档目录读取，物理隔离） */
export function getArchivedSessions(): Session[] {
  return daoGetArchivedSessions();
}

/** 搜索归档会话（从归档目录读取） */
export function searchArchivedSessions(query: string): Session[] {
  return daoSearchArchivedSessions(query);
}

/** 归档会话：生成摘要 + 写入向量记忆 + 物理移动到归档目录 */
export function archiveSession(sessionId: string, summary?: string): boolean {
  const now = new Date().toISOString();

  if (!summary) {
    summary = generateSessionSummary(sessionId);
  }

  const { session } = parseSessionFile(sessionId);
  if (!session) return false;
  if (session.status === 'archived') return false;

  // 先写入摘要（在文件还在活跃目录时操作）
  if (summary) {
    rewriteSessionFirstLine(sessionId, (firstLine) => {
      firstLine.session.summary = summary || firstLine.session.summary;
      firstLine.session.updatedAt = now;
    });
  }

  // 物理归档（重写状态 + 移动文件）
  const ok = archiveSessionInStorage(sessionId);

  // 归档时自动将会话摘要写入向量记忆（异步，不阻塞归档）
  if (ok && summary) {
    writeMemory({
      userId: 'default',
      sessionId,
      category: 'conversation',
      content: `[会话摘要] ${summary}`,
      keywords: extractKeywords(summary),
    }).catch(e => logger.warn('[SessionLifecycle] 会话摘要 embedding 失败:', e));
  }

  return ok;
}

/** 恢复归档会话：物理移回活跃目录 + 更新状态 */
export function restoreSession(sessionId: string): boolean {
  // 先从归档目录移回活跃目录
  const moved = restoreSessionFromStorage(sessionId);
  if (!moved) return false;

  // 恢复后额外更新 sessionDate 等字段
  const now = new Date().toISOString();
  return rewriteSessionFirstLine(sessionId, (firstLine) => {
    firstLine.session.sessionDate = now.split('T')[0];
  });
}

/**
 * 更新会话最后活跃时间。
 * no-op: getSessions 已用文件 mtime 排序，不再需要重写首行。
 * 保留接口签名避免调用方报错。
 */
export function touchSession(_sessionId: string): void {
  // intentionally empty — file mtime drives sort order
}

/** 获取子会话列表 */
export function getSubSessions(parentSessionId: string): Session[] {
  const result: Session[] = [];
  for (const { session } of iterateAllSessions()) {
    if (session.parentSessionId === parentSessionId) {
      result.push(session);
    }
  }
  result.sort((a, b) => {
    const aTime = a.createdAt || '';
    const bTime = b.createdAt || '';
    return aTime.localeCompare(bTime);
  });
  return result;
}

/** 创建子会话（子任务自动触发） */
export function createSubSession(
  parentSessionId: string,
  title: string,
  model: string,
  tags?: string[]
): Session {
  const now = new Date().toISOString();
  const id = uuidv4();

  // 读取父会话属性
  const { session: parent } = parseSessionFile(parentSessionId);

  const session: Session = {
    id,
    title,
    model,
    agentId: parent?.agentId,
    folderId: parent?.folderId || null,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    lastActiveAt: now,
    sessionDate: now.split('T')[0],
    parentSessionId,
    tags: JSON.stringify(tags || []),
  };

  const sessionData = { session, messages: [] };
  FileStorage.appendSessionLine(id, sessionData);

  return session;
}

/** 获取今日活跃会话（按 sessionDate 筛选） */
export function getTodaySessions(): Session[] {
  const today = new Date().toISOString().split('T')[0];
  const result: Session[] = [];
  for (const { session } of iterateAllSessions()) {
    if (session.sessionDate === today && (session.status === 'active' || session.status === null || session.status === undefined)) {
      result.push(session);
    }
  }
  result.sort((a, b) => {
    const aTime = a.updatedAt || a.createdAt || '';
    const bTime = b.updatedAt || b.createdAt || '';
    return bTime.localeCompare(aTime);
  });
  return result;
}

/** 永久删除归档会话（从归档目录删除） */
export function deleteArchivedSession(sessionId: string): boolean {
  const firstLine = FileStorage.readArchivedSessionFirstLine(sessionId) as any;
  if (!firstLine || !firstLine.session) return false;
  daoDeleteArchivedSession(sessionId);
  return true;
}

// ===================== 内部工具 =====================

/** 从会话消息中生成简要摘要 */
function generateSessionSummary(sessionId: string): string {
  try {
    const { messages } = parseSessionFile(sessionId);

    if (messages.length === 0) return '';

    // 取前 N 条消息
    const limitedMessages = messages.slice(0, SUMMARY_MAX_MESSAGES * 2);

    // v1.5.132: 过滤工具执行结果和过短消息，提高摘要质量
    const meaningfulMessages = limitedMessages.filter(m => {
      if (m.role !== 'user' && m.role !== 'assistant') return false;
      if (!m.content || m.content.length < 5) return false;
      // 过滤纯工具输出
      if (m.content.startsWith('{') || m.content.startsWith('[')) return false;
      return true;
    });

    // 取第一条用户消息作为摘要基础
    const firstUserMsg = meaningfulMessages.find(m => m.role === 'user');
    const lastAssistantMsg = [...meaningfulMessages].reverse().find(m => m.role === 'assistant');

    let summary = '';
    if (firstUserMsg) {
      summary = firstUserMsg.content.slice(0, 100);
    }
    if (lastAssistantMsg && meaningfulMessages.length > 2) {
      summary += ` → ${lastAssistantMsg.content.slice(0, 80)}`;
    }
    return summary.slice(0, 200);
  } catch {
    return '';
  }
}

// ===================== 生命周期管理器 =====================

export class SessionLifecycleManager {
  private lastKnownDate: string = '';
  private isRunning = false;

  /** 启动生命周期守护 */
  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastKnownDate = new Date().toISOString().split('T')[0];

    // 空闲归档检测
    TimerManager.register({
      name: 'session-lifecycle-cleanup',
      intervalMs: IDLE_CHECK_INTERVAL_MS,
      callback: () => {
        this.checkIdleSessions();
      },
      unref: true,
    });

    // 每日重置检测
    TimerManager.register({
      name: 'session-daily-reset',
      intervalMs: DAILY_RESET_CHECK_INTERVAL_MS,
      callback: () => {
        this.checkDailyReset();
      },
      unref: true,
    });

    logger.info(`[SessionLifecycle] 守护已启动 (idleThreshold=${IDLE_ARCHIVE_THRESHOLD_MS / 60000}min, checkInterval=${IDLE_CHECK_INTERVAL_MS / 60000}min)`);
  }

  /** 停止守护 */
  stop(): void {
    TimerManager.unregister('session-lifecycle-cleanup');
    TimerManager.unregister('session-daily-reset');
    this.isRunning = false;
    logger.info('[SessionLifecycle] 守护已停止');
  }

  /** 检测空闲会话并自动归档 */
  private checkIdleSessions(): void {
    try {
      const threshold = new Date(Date.now() - IDLE_ARCHIVE_THRESHOLD_MS).toISOString();

      // 查找超过 60 分钟无交互的活跃会话
      const idleSessions: Array<{ id: string; title: string; lastActiveAt: string }> = [];
      for (const { session, sessionId } of iterateAllSessions()) {
        if ((session.status === 'active' || session.status === null || session.status === undefined)
          && session.lastActiveAt
          && session.lastActiveAt < threshold) {
          idleSessions.push({ id: sessionId, title: session.title || '', lastActiveAt: session.lastActiveAt });
        }
      }

      if (idleSessions.length === 0) return;

      logger.info(`[SessionLifecycle] 发现 ${idleSessions.length} 个空闲会话，自动归档...`);

      for (const session of idleSessions) {
        const success = archiveSession(session.id);
        if (success) {
          logger.info(`[SessionLifecycle] 已归档空闲会话: "${session.title}" (idle since ${session.lastActiveAt})`);
        }
      }
    } catch (e) {
      logger.error('[SessionLifecycle] 空闲检测异常:', e);
    }
  }

  /** 检测日期变更 → 触发每日重置 */
  private checkDailyReset(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today === this.lastKnownDate) return;

    logger.info(`[SessionLifecycle] 检测到日期变更: ${this.lastKnownDate} → ${today}，执行每日重置...`);
    this.lastKnownDate = today;

    try {
      // 将昨日及更早的活跃会话标记为 daily_reset（可恢复的中间态）
      let resetCount = 0;
      for (const { session, sessionId } of iterateAllSessions()) {
        if ((session.status === 'active' || session.status === null || session.status === undefined)
          && session.sessionDate
          && session.sessionDate < today) {
          const ok = rewriteSessionFirstLine(sessionId, (firstLine) => {
            firstLine.session.status = 'daily_reset';
            firstLine.session.updatedAt = new Date().toISOString();
          });
          if (ok) resetCount++;
        }
      }

      logger.info(`[SessionLifecycle] ✅ 每日重置完成: ${resetCount} 个会话标记为 daily_reset`);

      // 自动为今日创建新会话（仅当今日无活跃会话时）
      const todaySessions = getTodaySessions();
      if (todaySessions.length === 0) {
        const now = new Date().toISOString();
        const newId = uuidv4();
        const session: Session = {
          id: newId,
          title: `对话 ${today}`,
          model: 'auto',
          createdAt: now,
          updatedAt: now,
          status: 'active',
          lastActiveAt: now,
          sessionDate: today,
          folderId: null,
          parentSessionId: null,
          tags: '[]',
        };
        FileStorage.appendSessionLine(newId, { session, messages: [] });
        logger.info(`[SessionLifecycle] 已为 ${today} 创建新会话: ${newId}`);
      }
    } catch (e) {
      logger.error('[SessionLifecycle] 每日重置异常:', e);
    }
  }

  /** 获取管理器状态（调试用） */
  getStatus(): { isRunning: boolean; lastKnownDate: string; idleThresholdMin: number } {
    return {
      isRunning: this.isRunning,
      lastKnownDate: this.lastKnownDate,
      idleThresholdMin: IDLE_ARCHIVE_THRESHOLD_MS / 60000,
    };
  }
}

/** 全局单例 */
export const sessionLifecycleManager = new SessionLifecycleManager();
