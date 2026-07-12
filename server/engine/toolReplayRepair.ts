/**
 * Tool Replay Repair — 工具重放修复
 *
 * 会话恢复时重放未完成的工具调用：
 * 1. 检测会话中是否有 pending 的工具回执
 * 2. 重新执行未完成的工具调用
 * 3. 将结果写回会话消息
 * 4. 标记回执为已完成
 *
 * P2-5: 增强三项能力：
 * - 统计/审计：每次重放记录到 toolExecutionStats + toolAuditLog
 * - 并发锁：防止同一会话被并发修复（repairingSessions Set）
 * - 走队列：通过 executeViaQueue 控制并发，避免重放洪水
 *
 * 参考: openclaw/src/agents/tool-replay-repair.live.test.ts
 *
 * v11.1: 新增工具重放修复
 */

import { logger } from '../logger.js';
import { toolSendReceipts, type ToolSendReceipt } from './toolSendReceipts.js';
import { executeToolCall } from './toolRegistry.js';
import { executeToolCallWithRetry, isTransientError } from './toolRetryWrapper.js';
import { executeToolCallWithTimeout } from './toolTimeoutWrapper.js';
import { executeToolCallWithMiddleware } from './toolResultMiddleware.js';
import { guardToolResultContext } from './toolContextGuard.js';
import { mcpClientManager } from './mcpClientManager.js';
import { isMcpToolName } from './mcpTypes.js';
import { toolExecutionStats } from './toolExecutionStats.js';
import { toolAuditLog } from './toolAuditLog.js';
import { executeViaQueue } from './toolExecutionQueue.js';
import type { ToolCall } from '../aiClient.js';

// ===================== 类型定义 =====================

export interface ReplayResult {
  receiptId: string;
  toolName: string;
  success: boolean;
  result?: string;
  error?: string;
  replayed: boolean;
}

export interface ReplayReport {
  sessionId: string;
  totalPending: number;
  replayed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  results: ReplayResult[];
}

// ===================== 状态 =====================

class ToolReplayRepairManager {
  /** P2-5: 并发修复锁 — 防止同一会话被并发修复 */
  private repairingSessions: Set<string> = new Set();

  /**
   * 检查并重放会话中未完成的工具调用
   * P2-5: 增加并发锁，同一会话不可并发修复
   */
  async repairSession(sessionId: string): Promise<ReplayReport> {
    // P2-5: 并发锁 — 同一会话已在修复中则跳过
    if (this.repairingSessions.has(sessionId)) {
      logger.debug(`[ToolReplay] Session ${sessionId} is already being repaired, skipping`);
      return {
        sessionId,
        totalPending: 0,
        replayed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 1,
        results: [],
      };
    }
    this.repairingSessions.add(sessionId);

    try {
      const pendingReceipts = toolSendReceipts.getReplayableReceipts(sessionId);

      const report: ReplayReport = {
        sessionId,
        totalPending: pendingReceipts.length,
        replayed: 0,
        succeeded: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };

      if (pendingReceipts.length === 0) {
        logger.debug(`[ToolReplay] No pending receipts for session ${sessionId}`);
        return report;
      }

      logger.info(`[ToolReplay] Found ${pendingReceipts.length} pending receipts for session ${sessionId}`);

      for (const receipt of pendingReceipts) {
        const result = await this.replayReceipt(receipt);
        report.results.push(result);
        report.replayed++;

        if (result.success) {
          report.succeeded++;
        } else if (result.replayed) {
          report.failed++;
        } else {
          report.skipped++;
        }
      }

      logger.info(
        `[ToolReplay] Session ${sessionId} repair complete: ` +
        `${report.succeeded} succeeded, ${report.failed} failed, ${report.skipped} skipped`
      );

      return report;
    } finally {
      // P2-5: 无论成功失败都释放并发锁
      this.repairingSessions.delete(sessionId);
    }
  }

  /**
   * 重放单个回执
   * P2-5: 走队列 + 统计/审计记录
   */
  private async replayReceipt(receipt: ToolSendReceipt): Promise<ReplayResult> {
    const startTime = Date.now();
    const baseResult: ReplayResult = {
      receiptId: receipt.id,
      toolName: receipt.toolName,
      success: false,
      replayed: false,
    };

    try {
      // 构造 ToolCall
      const toolCall: ToolCall = {
        id: receipt.id,
        type: 'function',
        function: {
          name: receipt.toolName,
          arguments: receipt.arguments,
        },
      };

      // 工具执行器（稳定性链：retry → timeout → executor）
      const toolExecutor = async (signal: AbortSignal): Promise<string> => {
        if (isMcpToolName(receipt.toolName)) {
          const args = JSON.parse(receipt.arguments || '{}');
          return mcpClientManager.executeMcpTool(receipt.toolName, args, { signal });
        }
        return executeToolCall(toolCall);
      };

      // P2-5: 走队列 — 通过 executeViaQueue 控制并发
      // 用闭包变量捕获 retryCount（队列返回值仅支持 string）
      let capturedRetryCount = 0;
      const args = JSON.parse(receipt.arguments || '{}');

      const result = await executeViaQueue<string>(
        receipt.toolName,
        args,
        async (queueSignal) => {
          const retryResult = await executeToolCallWithRetry(
            receipt.toolName,
            () => executeToolCallWithTimeout(receipt.toolName, toolExecutor, { signal: queueSignal }),
            {},
            queueSignal,
          );
          capturedRetryCount = retryResult.retryCount;
          return retryResult.result;
        },
        { sessionId: receipt.sessionId },
      );

      // 结果中间件
      const middlewareResult = executeToolCallWithMiddleware(receipt.toolName, result);
      const finalResult = middlewareResult.content;

      // 上下文保护
      const guardedResult = guardToolResultContext(finalResult, [], 128000);

      // 完成回执
      toolSendReceipts.completeReceipt(receipt.id, guardedResult, capturedRetryCount);

      // P2-5: 记录成功统计
      const endTime = Date.now();
      toolExecutionStats.record({
        toolName: receipt.toolName,
        startTime,
        endTime,
        success: true,
        retryCount: capturedRetryCount,
        timedOut: false,
        resultSize: guardedResult.length,
      });

      // P2-5: 记录审计日志
      toolAuditLog.log({
        toolName: receipt.toolName,
        sessionId: receipt.sessionId,
        args,
        result: guardedResult.slice(0, 500),
        success: true,
        durationMs: endTime - startTime,
        truncated: guardedResult.length > 500,
      });

      logger.info(`[ToolReplay] Replayed successfully: ${receipt.id} (${receipt.toolName})`);

      return {
        ...baseResult,
        success: true,
        result: guardedResult.slice(0, 500),
        replayed: true,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      // 标记失败
      toolSendReceipts.failReceipt(receipt.id, errorMsg);

      // P2-5: 记录失败统计
      const endTime = Date.now();
      const errorType = this.classifyErrorType(error);
      toolExecutionStats.record({
        toolName: receipt.toolName,
        startTime,
        endTime,
        success: false,
        errorType,
        errorMessage: errorMsg,
        retryCount: 0,
        timedOut: errorType === 'timeout',
      });

      // P2-5: 记录审计日志
      toolAuditLog.log({
        toolName: receipt.toolName,
        sessionId: receipt.sessionId,
        args: (() => { try { return JSON.parse(receipt.arguments || '{}'); } catch { return {}; } })(),
        result: errorMsg,
        success: false,
        durationMs: endTime - startTime,
        errorType,
        truncated: false,
      });

      logger.warn(`[ToolReplay] Replay failed: ${receipt.id} (${receipt.toolName}): ${errorMsg}`);

      return {
        ...baseResult,
        error: errorMsg,
        replayed: true,
      };
    }
  }

  /**
   * P2-5: 错误类型分类（用于统计/审计）
   */
  private classifyErrorType(error: unknown): 'timeout' | 'abort' | 'transient' | 'permanent' | 'validation' | 'unknown' {
    if (error instanceof Error) {
      if (error.name === 'ToolTimeoutError') return 'timeout';
      if (error.name === 'ToolAbortError' || error.name === 'AbortError') return 'abort';
      if (isTransientError(error)) return 'transient';
    }
    return 'unknown';
  }

  /**
   * 检查会话是否需要重放修复
   */
  needsRepair(sessionId: string): boolean {
    return toolSendReceipts.hasPendingReceipts(sessionId);
  }

  /**
   * 批量修复多个会话
   */
  async repairSessions(sessionIds: string[]): Promise<ReplayReport[]> {
    const reports: ReplayReport[] = [];
    for (const sessionId of sessionIds) {
      const report = await this.repairSession(sessionId);
      reports.push(report);
    }
    return reports;
  }
}

// ===================== 导出 =====================

export const toolReplayRepair = new ToolReplayRepairManager();
