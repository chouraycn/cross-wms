/**
 * 消息归档引擎
 *
 * 解决 messages 表无限增长导致数据库膨胀问题（当前 623MB）
 * - 自动归档超过 N 天的旧消息
 * - 压缩为摘要文本，原始内容标记 archived=1
 * - 查询时默认过滤 archived 消息
 * - 归档摘要可被记忆搜索系统索引
 */

import { logger } from '../logger.js';

// ===================== 配置 =====================

export interface ArchiveConfig {
  /** 归档阈值天数（超过此天数的会话将被归档） */
  archiveAfterDays: number;
  /** 保留最近 N 条消息不归档 */
  keepRecentMessages: number;
  /** 归档运行间隔（毫秒），默认 24 小时 */
  runIntervalMs: number;
  /** 归档摘要最大长度 */
  maxSummaryLength: number;
}

export const DEFAULT_ARCHIVE_CONFIG: ArchiveConfig = {
  archiveAfterDays: 30,
  keepRecentMessages: 20,
  runIntervalMs: 24 * 60 * 60 * 1000,
  maxSummaryLength: 2000,
};

// ===================== 类型 =====================

export interface ArchiveResult {
  sessionsArchived: number;
  messagesArchived: number;
  summariesCreated: number;
  bytesFreed: number;
}

// ===================== 归档逻辑 =====================

/**
 * 初始化归档相关表结构
 */
export function initArchiveTables(db: any): void {
  // 添加 archived 列（如果不存在）
  try {
    const columns = db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
    const hasArchived = columns.some(c => c.name === 'archived');
    if (!hasArchived) {
      db.exec('ALTER TABLE messages ADD COLUMN archived INTEGER NOT NULL DEFAULT 0');
      db.exec('CREATE INDEX IF NOT EXISTS idx_messages_archived ON messages(archived, sessionId)');
      logger.info('[Archive] 已添加 messages.archived 列');
    }
  } catch {
    // messages 表不存在，跳过列添加
  }

  // 创建归档摘要表
  db.exec(`
    CREATE TABLE IF NOT EXISTS message_archives (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      original_count INTEGER NOT NULL,
      date_range_start TEXT,
      date_range_end TEXT,
      total_tokens INTEGER DEFAULT 0,
      archived_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_message_archives_session ON message_archives(session_id);
  `);
}

/**
 * 执行一次归档扫描
 */
export function runArchive(db: any, config: ArchiveConfig = DEFAULT_ARCHIVE_CONFIG): ArchiveResult {
  const result: ArchiveResult = {
    sessionsArchived: 0,
    messagesArchived: 0,
    summariesCreated: 0,
    bytesFreed: 0,
  };

  try {
    // 查找需要归档的旧会话（超过阈值天数且未被归档过）
    const cutoffDate = new Date(Date.now() - config.archiveAfterDays * 24 * 60 * 60 * 1000)
      .toISOString().replace('T', ' ').slice(0, 19);

    const oldSessions = db.prepare(`
      SELECT s.id, COUNT(m.id) as msg_count
      FROM sessions s
      JOIN messages m ON m.sessionId = s.id AND m.archived = 0
      WHERE s.updatedAt < ? OR s.createdAt < ?
      GROUP BY s.id
      HAVING msg_count > ?
      ORDER BY s.createdAt ASC
    `).all(cutoffDate, cutoffDate, config.keepRecentMessages) as Array<{ id: string; msg_count: number }>;

    if (oldSessions.length === 0) {
      logger.debug('[Archive] 无需归档的会话');
      return result;
    }

    logger.info(`[Archive] 发现 ${oldSessions.length} 个旧会话需要归档`);

    for (const session of oldSessions) {
      try {
        // 获取该会话的所有消息（按时间排序）
        const messages = db.prepare(`
          SELECT id, role, content, timestamp, model, thinking
          FROM messages
          WHERE sessionId = ? AND archived = 0
          ORDER BY timestamp ASC
        `).all(session.id) as Array<{
          id: string; role: string; content: string; timestamp: string;
          model: string | null; thinking: string | null;
        }>;

        if (messages.length <= config.keepRecentMessages) continue;

        // 保留最近 N 条，归档其余的
        const toArchive = messages.slice(0, messages.length - config.keepRecentMessages);
        const toKeep = messages.slice(messages.length - config.keepRecentMessages);

        // 生成归档摘要
        const summary = generateSummary(toArchive, config.maxSummaryLength);

        // 计算时间范围
        const dateRangeStart = toArchive[0]?.timestamp;
        const dateRangeEnd = toArchive[toArchive.length - 1]?.timestamp;

        // 插入归档摘要
        db.prepare(`
          INSERT INTO message_archives (session_id, summary, original_count, date_range_start, date_range_end)
          VALUES (?, ?, ?, ?, ?)
        `).run(session.id, summary, toArchive.length, dateRangeStart, dateRangeEnd);

        // 标记旧消息为已归档，清空内容（释放空间）
        const archiveStmt = db.prepare(`
          UPDATE messages SET archived = 1, content = '[archived]', thinking = NULL, toolCalls = NULL
          WHERE id = ?
        `);
        for (const msg of toArchive) {
          archiveStmt.run(msg.id);
        }

        result.sessionsArchived++;
        result.messagesArchived += toArchive.length;
        result.summariesCreated++;
      } catch (err) {
        logger.warn(`[Archive] 归档会话 ${session.id} 失败:`, err instanceof Error ? err.message : String(err));
      }
    }

    if (result.messagesArchived > 0) {
      logger.info(`[Archive] 归档完成: ${result.sessionsArchived} 个会话, ${result.messagesArchived} 条消息`);
    }
  } catch (err) {
    logger.error('[Archive] 归档扫描失败:', err);
  }

  return result;
}

/**
 * 生成归档摘要（简单版：截取关键信息）
 *
 * 未来可接入 AI 生成更好的摘要
 */
function generateSummary(
  messages: Array<{ role: string; content: string }>,
  maxLength: number,
): string {
  const parts: string[] = [];
  let totalLen = 0;

  for (const msg of messages) {
    const prefix = msg.role === 'user' ? '👤' : msg.role === 'assistant' ? '🤖' : '🔧';
    const snippet = msg.content.length > 200 ? msg.content.slice(0, 200) + '...' : msg.content;
    const line = `${prefix} ${snippet}`;

    if (totalLen + line.length > maxLength) break;
    parts.push(line);
    totalLen += line.length;
  }

  return parts.join('\n');
}

/**
 * 启动定时归档任务
 */
export function startArchiveScheduler(
  getDb: () => any,
  config: ArchiveConfig = DEFAULT_ARCHIVE_CONFIG,
): NodeJS.Timeout {
  // 首次延迟 5 分钟执行（等服务器完全启动）
  const timer = setTimeout(() => {
    // 初始化归档表
    try {
      const db = getDb();
      initArchiveTables(db);
      runArchive(db, config);
    } catch (err) {
      logger.error('[Archive] 首次归档失败:', err);
    }

    // 之后定期执行
    const periodicTimer = setInterval(() => {
      try {
        const db = getDb();
        runArchive(db, config);
      } catch (err) {
        logger.error('[Archive] 定期归档失败:', err);
      }
    }, config.runIntervalMs);
    periodicTimer.unref();
  }, 5 * 60 * 1000);

  timer.unref();
  return timer;
}
