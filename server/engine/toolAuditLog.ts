/**
 * Tool Audit Log — 工具执行审计日志
 *
 * 记录所有工具执行的详细审计信息：
 * 1. 工具名称、参数（脱敏）、结果（截断）
 * 2. 执行时间、持续时间、成功/失败
 * 3. 降级记录（原始工具 → 实际工具）
 * 4. 错误类型、截断标记
 * 5. 会话 ID 关联
 *
 * v11.1: 新增工具执行审计日志
 */

import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface ToolAuditEntry {
  timestamp: number;
  toolName: string;
  originalToolName?: string;
  sessionId?: string;
  args: Record<string, unknown>;
  result: string;
  success: boolean;
  durationMs: number;
  errorType?: string;
  truncated: boolean;
}

// ===================== 常量 =====================

const MAX_LOG_ENTRIES = 1000;
const MAX_ARGS_SIZE = 2000;
const MAX_RESULT_SIZE = 500;
const AUDIT_LOG_FILE = 'tool-audit.jsonl';
const MAX_LOG_FILE_SIZE = 50 * 1024 * 1024; // 50 MB — 超过则轮转
const ROTATED_SUFFIX = '.old';
// P0-2: pendingWrites 上限 — WriteStream 不可用时防止内存无限增长
const MAX_PENDING_WRITES = 5000;

// ===================== 状态 =====================

class ToolAuditLogManager {
  private entries: ToolAuditEntry[] = [];
  private logStream: fs.WriteStream | null = null;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private pendingWrites: ToolAuditEntry[] = [];

  constructor() {
    this.init();
  }

  /**
   * 初始化审计日志
   */
  private init(): void {
    try {
      const logDir = AppPaths.dataDir;
      this.logPath = path.join(logDir, AUDIT_LOG_FILE);

      // 打开追加写入流
      this.logStream = this.createStreamWithErrorHandler(this.logPath);

      // 定时刷新缓冲区
      this.flushTimer = setInterval(() => {
        this.flush();
      }, 5000);

      logger.debug('[ToolAuditLog] Initialized');
    } catch (err) {
      logger.warn('[ToolAuditLog] Failed to initialize:', err);
    }
  }

  /**
   * P1: 创建 WriteStream 并附加 'error' 事件处理器
   * 防止磁盘满/文件被删/权限变更等场景导致进程崩溃（Node.js 默认对未处理 'error' 事件会 crash）
   */
  private createStreamWithErrorHandler(filePath: string): fs.WriteStream {
    const stream = fs.createWriteStream(filePath, { flags: 'a' });
    stream.on('error', (err) => {
      logger.warn(`[ToolAuditLog] Write stream error: ${err.message}`);
      // 标记流为不可用，下次 flush 时尝试重建
      this.logStream = null;
    });
    return stream;
  }

  /**
   * 记录审计条目
   */
  log(entry: Omit<ToolAuditEntry, 'timestamp'>): void {
    const auditEntry: ToolAuditEntry = {
      ...entry,
      timestamp: Date.now(),
    };

    // 脱敏参数
    auditEntry.args = this.sanitizeArgs(entry.args);

    // 添加到内存缓冲
    this.entries.push(auditEntry);
    if (this.entries.length > MAX_LOG_ENTRIES) {
      this.entries.shift();
    }

    // 添加到待写入队列
    // P0-2: pendingWrites 上限保护 — 防止 WriteStream 不可用时内存无限增长
    if (this.pendingWrites.length >= MAX_PENDING_WRITES) {
      // 丢弃最旧的条目，保留最新的
      const droppedCount = this.pendingWrites.length - MAX_PENDING_WRITES + 1;
      this.pendingWrites.splice(0, droppedCount);
      logger.error(
        `[ToolAuditLog] pendingWrites reached limit (${MAX_PENDING_WRITES}), dropped ${droppedCount} oldest entries — WriteStream may be unavailable`
      );
    }
    this.pendingWrites.push(auditEntry);
  }

  /**
   * 脱敏参数（移除敏感信息）
   */
  private sanitizeArgs(args: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};
    // 注意: 全部小写 — key.toLowerCase().includes(sk) 不会对 sk 做小写转换
    const sensitiveKeys = ['password', 'token', 'apikey', 'secret', 'credential', 'authorization'];

    for (const [key, value] of Object.entries(args)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'string' && value.length > MAX_ARGS_SIZE) {
        sanitized[key] = value.slice(0, MAX_ARGS_SIZE) + '...[truncated]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * 刷新缓冲区到文件
   * P0-2: WriteStream 不可用时也清空 pendingWrites（丢弃并记录丢失数量），防止内存无限增长
   */
  private flush(): void {
    if (this.pendingWrites.length === 0) return;

    // P0-2: WriteStream 不可用 — 丢弃 pendingWrites 并记录丢失数量
    if (!this.logStream) {
      const dropped = this.pendingWrites.length;
      this.pendingWrites.splice(0);
      logger.warn(`[ToolAuditLog] Dropped ${dropped} pending writes — WriteStream unavailable`);
      return;
    }

    const writes = this.pendingWrites.splice(0);
    for (const entry of writes) {
      try {
        this.logStream.write(JSON.stringify(entry) + '\n');
      } catch (err) {
        logger.warn('[ToolAuditLog] Write failed:', err);
      }
    }

    // v11.1: 检查是否需要轮转（每 1000 次写入检查一次以减少 stat 开销）
    if (this.writeCount++ % 1000 === 0) {
      this.rotateIfNeeded();
    }
  }

  private writeCount = 0;
  private logPath: string | null = null;

  /**
   * v11.1: 日志轮转 — 当文件超过 MAX_LOG_FILE_SIZE 时，重命名为 .old 并新建文件
   * 防止审计日志文件无限增长
   */
  private rotateIfNeeded(): void {
    if (!this.logPath || !this.logStream) return;
    try {
      const stat = fs.statSync(this.logPath);
      if (stat.size < MAX_LOG_FILE_SIZE) return;

      // 关闭当前流
      this.logStream.end();
      this.logStream = null;

      // 重命名当前文件为 .old（覆盖旧的 .old）
      const rotatedPath = this.logPath + ROTATED_SUFFIX;
      try {
        if (fs.existsSync(rotatedPath)) {
          fs.unlinkSync(rotatedPath);
        }
      } catch {
        // ignore
      }
      fs.renameSync(this.logPath, rotatedPath);

      // 新建文件流（P1: 复用 error handler 逻辑）
      this.logStream = this.createStreamWithErrorHandler(this.logPath);
      logger.info(`[ToolAuditLog] Rotated log file (was ${Math.round(stat.size / 1024 / 1024)}MB)`);
    } catch (err) {
      logger.warn('[ToolAuditLog] Rotation failed:', err instanceof Error ? err.message : String(err));
    }
  }

  /**
   * 获取最近的审计条目
   */
  getRecentEntries(count: number = 50): ToolAuditEntry[] {
    return this.entries.slice(-count);
  }

  /**
   * 获取指定工具的审计条目
   */
  getEntriesByTool(toolName: string, count: number = 50): ToolAuditEntry[] {
    return this.entries
      .filter(e => e.toolName === toolName)
      .slice(-count);
  }

  /**
   * 获取指定会话的审计条目
   */
  getEntriesBySession(sessionId: string, count: number = 50): ToolAuditEntry[] {
    return this.entries
      .filter(e => e.sessionId === sessionId)
      .slice(-count);
  }

  /**
   * 获取失败的审计条目
   */
  getFailedEntries(count: number = 50): ToolAuditEntry[] {
    return this.entries
      .filter(e => !e.success)
      .slice(-count);
  }

  /**
   * 获取降级的审计条目
   */
  getFallbackEntries(count: number = 50): ToolAuditEntry[] {
    return this.entries
      .filter(e => e.originalToolName && e.originalToolName !== e.toolName)
      .slice(-count);
  }

  /**
   * 生成审计报告
   */
  generateReport(): string {
    const total = this.entries.length;
    const successCount = this.entries.filter(e => e.success).length;
    const failureCount = total - successCount;
    const fallbackCount = this.entries.filter(e => e.originalToolName && e.originalToolName !== e.toolName).length;
    const truncatedCount = this.entries.filter(e => e.truncated).length;

    // 按工具统计
    const toolStats: Record<string, { total: number; success: number; failure: number }> = {};
    for (const entry of this.entries) {
      if (!toolStats[entry.toolName]) {
        toolStats[entry.toolName] = { total: 0, success: 0, failure: 0 };
      }
      toolStats[entry.toolName].total++;
      if (entry.success) {
        toolStats[entry.toolName].success++;
      } else {
        toolStats[entry.toolName].failure++;
      }
    }

    const lines: string[] = [
      '# Tool Execution Audit Report',
      '',
      `Generated at: ${new Date().toISOString()}`,
      '',
      '## Summary',
      `- Total Executions: ${total}`,
      `- Success: ${successCount} (${total > 0 ? ((successCount / total) * 100).toFixed(1) : 0}%)`,
      `- Failure: ${failureCount} (${total > 0 ? ((failureCount / total) * 100).toFixed(1) : 0}%)`,
      `- Fallbacks: ${fallbackCount}`,
      `- Truncated Results: ${truncatedCount}`,
      '',
      '## Per-Tool Statistics',
    ];

    for (const [tool, stats] of Object.entries(toolStats).sort((a, b) => b[1].total - a[1].total)) {
      const rate = ((stats.success / stats.total) * 100).toFixed(1);
      lines.push(`- ${tool}: ${stats.total} calls, ${rate}% success (${stats.failure} failures)`);
    }

    // 最近 10 条失败记录
    const recentFailures = this.getFailedEntries(10);
    if (recentFailures.length > 0) {
      lines.push('', '## Recent Failures (last 10)');
      for (const entry of recentFailures.reverse()) {
        lines.push(`- [${new Date(entry.timestamp).toISOString()}] ${entry.toolName}: ${entry.errorType || 'unknown'}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * 关闭审计日志
   */
  shutdown(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.logStream) {
      this.logStream.end();
      this.logStream = null;
    }
    logger.debug('[ToolAuditLog] Shutdown');
  }
}

// ===================== 导出 =====================

export const toolAuditLog = new ToolAuditLogManager();