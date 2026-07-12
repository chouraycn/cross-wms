/**
 * Tool Send Receipts — 工具发送回执
 *
 * 确保工具调用结果不丢失：
 * 1. 每次工具调用前写入回执（pending 状态）
 * 2. 工具执行完成后更新回执（completed/failed）
 * 3. 会话恢复时检查 pending 回执，重放未完成的调用
 * 4. 回执持久化到文件，支持跨进程恢复
 *
 * 参考: openclaw/src/agents/embedded-agent-runner/tool-send-receipts.ts
 *
 * v11.1: 新增工具发送回执
 */

import * as fs from 'fs';
import * as path from 'path';
import { AppPaths } from '../config/appPaths.js';
import { logger } from '../logger.js';

// ===================== 类型定义 =====================

export interface ToolSendReceipt {
  /** 唯一 ID（等于 toolCall.id） */
  id: string;
  /** 工具名 */
  toolName: string;
  /** 会话 ID */
  sessionId: string;
  /** 参数（JSON 字符串） */
  arguments: string;
  /** 状态 */
  status: 'pending' | 'completed' | 'failed';
  /** 创建时间 */
  createdAt: number;
  /** 完成时间 */
  completedAt?: number;
  /** 结果（截断） */
  result?: string;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retryCount?: number;
}

// ===================== 常量 =====================

const RECEIPTS_DIR = 'tool-receipts';
const MAX_RECEIPT_AGE_MS = 24 * 60 * 60 * 1000; // 24 小时
const MAX_RESULT_SIZE = 2000;

// ===================== 状态 =====================

class ToolSendReceiptManager {
  private receiptsDir: string;
  private pendingReceipts: Map<string, ToolSendReceipt> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 小时
  /** P1-6: 内存索引 — toolCallId → sessionId，避免 findReceiptInFiles 全量扫描 */
  private idToSessionIndex: Map<string, string> = new Map();

  constructor() {
    this.receiptsDir = path.join(AppPaths.dataDir, RECEIPTS_DIR);
    this.ensureDir();
  }

  /**
   * 启动定时清理过期回执文件 + 压缩活跃文件
   */
  startAutoCleanup(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
      // 同时压缩所有活跃会话文件（去重保留最新状态）
      this.compactAllSessions().catch(() => {});
    }, ToolSendReceiptManager.CLEANUP_INTERVAL_MS);
    if (typeof this.cleanupTimer.unref === 'function') {
      this.cleanupTimer.unref();
    }
  }

  /**
   * 停止定时清理
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * 确保目录存在
   */
  private ensureDir(): void {
    try {
      if (!fs.existsSync(this.receiptsDir)) {
        fs.mkdirSync(this.receiptsDir, { recursive: true });
      }
    } catch (err) {
      logger.warn('[ToolReceipts] Failed to create receipts dir:', err);
    }
  }

  /**
   * 获取会话回执文件路径
   */
  private getReceiptFilePath(sessionId: string): string {
    return path.join(this.receiptsDir, `${sessionId}.jsonl`);
  }

  /**
   * 创建回执（工具执行前调用）
   */
  createReceipt(receipt: Omit<ToolSendReceipt, 'status' | 'createdAt'>): void {
    const full: ToolSendReceipt = {
      ...receipt,
      status: 'pending',
      createdAt: Date.now(),
    };

    // 内存缓存
    this.pendingReceipts.set(receipt.id, full);
    // P1-6: 建立内存索引，避免后续 findReceiptInFiles 全量扫描
    this.idToSessionIndex.set(receipt.id, receipt.sessionId);

    // 持久化
    this.appendReceipt(full);

    logger.debug(`[ToolReceipts] Created receipt: ${receipt.id} (${receipt.toolName})`);
  }

  /**
   * 完成回执（工具执行成功后调用）
   * 若内存 Map 中找不到（如进程重启后从文件加载的场景），则回退到从文件读取并更新
   */
  completeReceipt(id: string, result: string, retryCount: number = 0): void {
    let receipt = this.pendingReceipts.get(id);
    if (!receipt) {
      // P0-3 修复：进程重启后 pendingReceipts Map 为空，但文件中仍有 pending 回执
      // 从所有会话文件查找该 ID 的回执（用于 replay 场景）
      receipt = this.findReceiptInFiles(id);
      if (!receipt) {
        logger.warn(`[ToolReceipts] Receipt not found for completion: ${id}`);
        return;
      }
    }
    receipt.status = 'completed';
    receipt.completedAt = Date.now();
    receipt.result = result.slice(0, MAX_RESULT_SIZE);
    receipt.retryCount = retryCount;
    this.appendReceipt(receipt);
    this.pendingReceipts.delete(id);
    // P0: 清理 idToSessionIndex 索引项，防止 Map 无限增长
    this.idToSessionIndex.delete(id);
    logger.debug(`[ToolReceipts] Completed receipt: ${id}`);
  }

  /**
   * 失败回执（工具执行失败后调用）
   * 若内存 Map 中找不到，则回退到从文件读取并更新
   */
  failReceipt(id: string, error: string, retryCount: number = 0): void {
    let receipt = this.pendingReceipts.get(id);
    if (!receipt) {
      receipt = this.findReceiptInFiles(id);
      if (!receipt) {
        logger.warn(`[ToolReceipts] Receipt not found for failure: ${id}`);
        return;
      }
    }
    receipt.status = 'failed';
    receipt.completedAt = Date.now();
    receipt.error = error.slice(0, MAX_RESULT_SIZE);
    receipt.retryCount = retryCount;
    this.appendReceipt(receipt);
    this.pendingReceipts.delete(id);
    // P0: 清理 idToSessionIndex 索引项，防止 Map 无限增长
    this.idToSessionIndex.delete(id);
    logger.debug(`[ToolReceipts] Failed receipt: ${id}`);
  }

  /**
   * 追加回执到文件
   */
  private appendReceipt(receipt: ToolSendReceipt): void {
    try {
      const filePath = this.getReceiptFilePath(receipt.sessionId);
      fs.appendFileSync(filePath, JSON.stringify(receipt) + '\n', 'utf8');
    } catch (err) {
      logger.warn('[ToolReceipts] Failed to append receipt:', err);
    }
  }

  /**
   * 获取会话的所有回执
   */
  getReceipts(sessionId: string): ToolSendReceipt[] {
    try {
      const filePath = this.getReceiptFilePath(sessionId);
      if (!fs.existsSync(filePath)) return [];

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      // 按时间排序，后面的覆盖前面的（同 ID 取最新）
      const receiptMap = new Map<string, ToolSendReceipt>();
      for (const line of lines) {
        try {
          const receipt: ToolSendReceipt = JSON.parse(line);
          receiptMap.set(receipt.id, receipt);
        } catch {
          // skip invalid lines
        }
      }

      return Array.from(receiptMap.values()).sort((a, b) => a.createdAt - b.createdAt);
    } catch (err) {
      logger.warn('[ToolReceipts] Failed to read receipts:', err);
      return [];
    }
  }

  /**
   * 获取会话中未完成的回执（pending 状态）
   */
  getPendingReceipts(sessionId: string): ToolSendReceipt[] {
    return this.getReceipts(sessionId).filter(r => r.status === 'pending');
  }

  /**
   * 检查会话是否有未完成的工具调用
   */
  hasPendingReceipts(sessionId: string): boolean {
    return this.getPendingReceipts(sessionId).length > 0;
  }

  /**
   * 清理过期的回执文件
   */
  cleanupExpired(): number {
    let cleanedCount = 0;
    const now = Date.now();
    const deletedSessionIds = new Set<string>();

    try {
      const files = fs.readdirSync(this.receiptsDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const filePath = path.join(this.receiptsDir, file);
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > MAX_RECEIPT_AGE_MS) {
          fs.unlinkSync(filePath);
          deletedSessionIds.add(file.replace(/\.jsonl$/, ''));
          cleanedCount++;
        }
      }
    } catch (err) {
      logger.warn('[ToolReceipts] Cleanup failed:', err);
    }

    // P0: 清理 idToSessionIndex 中指向已删除会话文件的索引项
    if (deletedSessionIds.size > 0) {
      for (const [id, sessId] of this.idToSessionIndex) {
        if (deletedSessionIds.has(sessId)) {
          this.idToSessionIndex.delete(id);
        }
      }
    }

    // P1-5: 清理 pendingReceipts 中的 stale 条目
    // 防止工具调用 hang 住不返回时，条目永久残留
    let stalePendingCount = 0;
    // 复用前面已声明的 now 变量，不重复声明
    for (const [id, receipt] of this.pendingReceipts) {
      if (now - receipt.createdAt > MAX_RECEIPT_AGE_MS) {
        this.pendingReceipts.delete(id);
        this.idToSessionIndex.delete(id);
        stalePendingCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info(`[ToolReceipts] Cleaned ${cleanedCount} expired receipt files`);
    }
    if (stalePendingCount > 0) {
      logger.warn(`[ToolReceipts] Removed ${stalePendingCount} stale pending receipts (older than ${MAX_RECEIPT_AGE_MS}ms)`);
    }

    return cleanedCount;
  }

  /**
   * 清除指定会话的回执
   */
  clearSession(sessionId: string): void {
    try {
      const filePath = this.getReceiptFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      logger.warn(`[ToolReceipts] Failed to clear session ${sessionId}:`, err);
    }
    // P0: 清理 idToSessionIndex 中属于该会话的索引项
    for (const [id, sessId] of this.idToSessionIndex) {
      if (sessId === sessionId) {
        this.idToSessionIndex.delete(id);
      }
    }
    // 同时清理 pendingReceipts 中属于该会话的项
    for (const [id, receipt] of this.pendingReceipts) {
      if (receipt.sessionId === sessionId) {
        this.pendingReceipts.delete(id);
      }
    }
  }

  /**
   * P0-3 修复 + P1-6 优化：查找指定 ID 的回执
   * 优先使用内存索引定位文件，避免全量扫描数千文件
   * 若索引未命中（进程重启后），回退到全量扫描
   */
  private findReceiptInFiles(id: string): ToolSendReceipt | undefined {
    try {
      // P1-6: 优先用内存索引定位文件
      const sessionId = this.idToSessionIndex.get(id);
      if (sessionId) {
        const receipt = this.findReceiptInFile(id, sessionId);
        if (receipt) return receipt;
      }
      // 索引未命中，回退到全量扫描（进程重启后场景）
      const files = fs.readdirSync(this.receiptsDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const sessId = file.replace(/\.jsonl$/, '');
        const receipt = this.findReceiptInFile(id, sessId);
        if (receipt) {
          // 回填索引
          this.idToSessionIndex.set(id, sessId);
          return receipt;
        }
      }
    } catch (err) {
      logger.warn('[ToolReceipts] findReceiptInFiles failed:', err);
    }
    return undefined;
  }

  /**
   * P1-6: 在单个会话文件中查找指定 ID 的回执
   */
  private findReceiptInFile(id: string, sessionId: string): ToolSendReceipt | undefined {
    try {
      const filePath = this.getReceiptFilePath(sessionId);
      if (!fs.existsSync(filePath)) return undefined;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      let found: ToolSendReceipt | undefined;
      for (const line of lines) {
        try {
          const r: ToolSendReceipt = JSON.parse(line);
          if (r.id === id) {
            found = r; // 后覆盖前（取最新状态）
          }
        } catch {
          // skip
        }
      }
      return found;
    } catch {
      return undefined;
    }
  }

  /**
   * 压缩单个会话的回执文件（去重，保留每个 ID 的最新状态）
   * 减少 JSONL 文件无限增长
   */
  compactSessionFile(sessionId: string): number {
    try {
      const filePath = this.getReceiptFilePath(sessionId);
      if (!fs.existsSync(filePath)) return 0;
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      if (lines.length === 0) return 0;

      // 按 ID 去重，后覆盖前
      const receiptMap = new Map<string, ToolSendReceipt>();
      for (const line of lines) {
        try {
          const r: ToolSendReceipt = JSON.parse(line);
          receiptMap.set(r.id, r);
        } catch {
          // skip invalid
        }
      }

      const compacted = Array.from(receiptMap.values());
      const newContent = compacted.map(r => JSON.stringify(r)).join('\n') + '\n';
      fs.writeFileSync(filePath, newContent, 'utf8');

      const saved = lines.length - compacted.length;
      if (saved > 0) {
        logger.debug(`[ToolReceipts] Compacted ${sessionId}: ${lines.length} → ${compacted.length} lines (saved ${saved})`);
      }
      return saved;
    } catch (err) {
      logger.warn(`[ToolReceipts] Compact failed for ${sessionId}:`, err);
      return 0;
    }
  }

  /**
   * 压缩所有会话回执文件
   */
  async compactAllSessions(): Promise<number> {
    let totalSaved = 0;
    try {
      const files = fs.readdirSync(this.receiptsDir);
      for (const file of files) {
        if (!file.endsWith('.jsonl')) continue;
        const sessionId = file.replace(/\.jsonl$/, '');
        totalSaved += this.compactSessionFile(sessionId);
      }
      if (totalSaved > 0) {
        logger.info(`[ToolReceipts] Compacted all sessions, saved ${totalSaved} duplicate lines`);
      }
    } catch (err) {
      logger.warn('[ToolReceipts] compactAllSessions failed:', err);
    }
    return totalSaved;
  }

  /**
   * 获取待恢复的回执（用于会话恢复时重放）
   */
  getReplayableReceipts(sessionId: string): ToolSendReceipt[] {
    return this.getPendingReceipts(sessionId).filter(r => {
      // 排除超过 1 小时的 pending 回执（可能已永久失败）
      return Date.now() - r.createdAt < 60 * 60 * 1000;
    });
  }
}

// ===================== 导出 =====================

export const toolSendReceipts = new ToolSendReceiptManager();