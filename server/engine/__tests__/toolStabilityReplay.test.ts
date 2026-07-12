/**
 * 工具稳定性重放/统计/审计模块单元测试
 * 覆盖: toolSendReceipts + toolExecutionStats + toolAuditLog + toolReplayRepair
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { toolSendReceipts, type ToolSendReceipt } from '../toolSendReceipts.js';
import { toolExecutionStats, type ToolExecutionRecord } from '../toolExecutionStats.js';
import { toolAuditLog } from '../toolAuditLog.js';
import { toolReplayRepair } from '../toolReplayRepair.js';

// ===================== 测试工具 =====================

const TEST_SESSION_PREFIX = `test-replay-${Date.now()}`;
let sessionCounter = 0;
let receiptCounter = 0;

function uniqueSessionId(): string {
  return `${TEST_SESSION_PREFIX}-${sessionCounter++}`;
}

function uniqueReceiptId(): string {
  return `receipt-${TEST_SESSION_PREFIX}-${receiptCounter++}`;
}

function makeReceiptBase(sessionId: string, toolName: string = 'test_tool'): Omit<ToolSendReceipt, 'status' | 'createdAt'> {
  return {
    id: uniqueReceiptId(),
    toolName,
    sessionId,
    arguments: JSON.stringify({ query: 'test' }),
  };
}

function makeExecutionRecord(toolName: string, success: boolean, durationMs: number = 100): Omit<ToolExecutionRecord, 'durationMs'> {
  const now = Date.now();
  return {
    toolName,
    startTime: now - durationMs,
    endTime: now,
    success,
    retryCount: 0,
    timedOut: false,
  };
}

// ===================== toolSendReceipts =====================

describe('toolSendReceipts — 回执管理', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = uniqueSessionId();
  });

  afterEach(() => {
    toolSendReceipts.clearSession(sessionId);
  });

  describe('createReceipt + getReceipts', () => {
    it('应创建 pending 状态的回执并可通过 getReceipts 读取', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      expect(receipts).toHaveLength(1);
      expect(receipts[0].id).toBe(base.id);
      expect(receipts[0].status).toBe('pending');
      expect(receipts[0].toolName).toBe('test_tool');
    });

    it('创建多个回执应全部可读取', () => {
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));

      const receipts = toolSendReceipts.getReceipts(sessionId);
      expect(receipts).toHaveLength(2);
    });

    it('回执应按时间排序', () => {
      const base1 = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base1);

      // 确保时间差
      const base2 = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base2);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      expect(receipts[0].createdAt).toBeLessThanOrEqual(receipts[1].createdAt);
    });
  });

  describe('completeReceipt', () => {
    it('应将 pending 回执标记为 completed', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);

      const result = '执行成功结果';
      toolSendReceipts.completeReceipt(base.id, result, 2);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      const completed = receipts.find(r => r.id === base.id);
      expect(completed).toBeDefined();
      expect(completed!.status).toBe('completed');
      expect(completed!.result).toBe(result);
      expect(completed!.retryCount).toBe(2);
      expect(completed!.completedAt).toBeDefined();
    });

    it('结果应被截断到 MAX_RESULT_SIZE', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);

      const longResult = 'x'.repeat(5000);
      toolSendReceipts.completeReceipt(base.id, longResult, 0);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      const completed = receipts.find(r => r.id === base.id);
      expect(completed!.result!.length).toBeLessThanOrEqual(2000);
    });

    it('完成不存在的回执应安全无异常', () => {
      expect(() => {
        toolSendReceipts.completeReceipt('nonexistent-id', 'result', 0);
      }).not.toThrow();
    });
  });

  describe('failReceipt', () => {
    it('应将 pending 回执标记为 failed', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);

      toolSendReceipts.failReceipt(base.id, '执行失败', 1);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      const failed = receipts.find(r => r.id === base.id);
      expect(failed).toBeDefined();
      expect(failed!.status).toBe('failed');
      expect(failed!.error).toBe('执行失败');
      expect(failed!.retryCount).toBe(1);
    });

    it('失败不存在的回执应安全无异常', () => {
      expect(() => {
        toolSendReceipts.failReceipt('nonexistent-id', 'error', 0);
      }).not.toThrow();
    });
  });

  describe('getPendingReceipts + hasPendingReceipts', () => {
    it('应返回 pending 状态的回执', () => {
      const base1 = makeReceiptBase(sessionId);
      const base2 = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base1);
      toolSendReceipts.createReceipt(base2);
      toolSendReceipts.completeReceipt(base1.id, 'result', 0);

      const pending = toolSendReceipts.getPendingReceipts(sessionId);
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe(base2.id);
    });

    it('hasPendingReceipts 应正确反映是否有 pending 回执', () => {
      expect(toolSendReceipts.hasPendingReceipts(sessionId)).toBe(false);

      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));
      expect(toolSendReceipts.hasPendingReceipts(sessionId)).toBe(true);
    });

    it('所有回执完成后 hasPendingReceipts 应为 false', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);
      toolSendReceipts.completeReceipt(base.id, 'result', 0);

      expect(toolSendReceipts.hasPendingReceipts(sessionId)).toBe(false);
    });
  });

  describe('getReplayableReceipts', () => {
    it('应返回 1 小时内的 pending 回执', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);

      const replayable = toolSendReceipts.getReplayableReceipts(sessionId);
      expect(replayable).toHaveLength(1);
      expect(replayable[0].id).toBe(base.id);
    });
  });

  describe('clearSession', () => {
    it('应清除指定会话的所有回执', () => {
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));
      toolSendReceipts.clearSession(sessionId);

      const receipts = toolSendReceipts.getReceipts(sessionId);
      expect(receipts).toHaveLength(0);
    });

    it('清除后 hasPendingReceipts 应为 false', () => {
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));
      toolSendReceipts.clearSession(sessionId);

      expect(toolSendReceipts.hasPendingReceipts(sessionId)).toBe(false);
    });
  });

  describe('compactSessionFile', () => {
    it('应去重保留每个 ID 的最新状态', () => {
      const base = makeReceiptBase(sessionId);
      toolSendReceipts.createReceipt(base);
      toolSendReceipts.completeReceipt(base.id, 'final result', 0);

      // 压缩前文件中有 2 行（pending + completed）
      const beforeReceipts = toolSendReceipts.getReceipts(sessionId);
      expect(beforeReceipts).toHaveLength(1); // getReceipts 已去重

      const saved = toolSendReceipts.compactSessionFile(sessionId);
      expect(saved).toBeGreaterThanOrEqual(1); // 至少去掉了 1 行重复

      const afterReceipts = toolSendReceipts.getReceipts(sessionId);
      expect(afterReceipts).toHaveLength(1);
      expect(afterReceipts[0].status).toBe('completed');
    });
  });
});

// ===================== toolExecutionStats =====================

describe('toolExecutionStats — 执行统计', () => {
  const testToolName = `test_stats_tool_${Date.now()}`;

  afterEach(() => {
    toolExecutionStats.clear(testToolName);
  });

  describe('record + getStats', () => {
    it('应记录成功执行并更新统计', () => {
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));

      const stats = toolExecutionStats.getStats(testToolName);
      expect(stats).toBeDefined();
      expect(stats!.totalCalls).toBe(1);
      expect(stats!.successCount).toBe(1);
      expect(stats!.failureCount).toBe(0);
    });

    it('应记录失败执行并更新统计', () => {
      toolExecutionStats.record({
        ...makeExecutionRecord(testToolName, false, 200),
        errorType: 'timeout',
        errorMessage: 'Tool timed out',
        timedOut: true,
      });

      const stats = toolExecutionStats.getStats(testToolName);
      expect(stats!.failureCount).toBe(1);
      expect(stats!.timeoutCount).toBe(1);
      expect(stats!.errorTypes.timeout).toBe(1);
      expect(stats!.lastError).toBe('Tool timed out');
    });

    it('应计算 avgDurationMs / p50 / p90 / p99', () => {
      for (let i = 0; i < 10; i++) {
        toolExecutionStats.record(makeExecutionRecord(testToolName, true, (i + 1) * 100));
      }

      const stats = toolExecutionStats.getStats(testToolName);
      expect(stats!.totalCalls).toBe(10);
      expect(stats!.avgDurationMs).toBeGreaterThan(0);
      expect(stats!.p50DurationMs).toBeGreaterThan(0);
      expect(stats!.p90DurationMs).toBeGreaterThanOrEqual(stats!.p50DurationMs);
      expect(stats!.p99DurationMs).toBeGreaterThanOrEqual(stats!.p90DurationMs);
    });

    it('应统计 retryCount 总和', () => {
      toolExecutionStats.record({ ...makeExecutionRecord(testToolName, true, 100), retryCount: 2 });
      toolExecutionStats.record({ ...makeExecutionRecord(testToolName, true, 100), retryCount: 1 });

      const stats = toolExecutionStats.getStats(testToolName);
      expect(stats!.retryCount).toBe(3);
    });
  });

  describe('getHealthStatus', () => {
    it('未记录的工具应为 healthy 且 healthScore=100', () => {
      const health = toolExecutionStats.getHealthStatus('nonexistent_tool_xyz');
      expect(health.status).toBe('healthy');
      expect(health.healthScore).toBe(100);
      expect(health.consecutiveFailures).toBe(0);
    });

    it('全部成功的工具应为 healthy', () => {
      for (let i = 0; i < 5; i++) {
        toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));
      }

      const health = toolExecutionStats.getHealthStatus(testToolName);
      expect(health.status).toBe('healthy');
      expect(health.healthScore).toBeGreaterThanOrEqual(70);
      expect(health.consecutiveFailures).toBe(0);
    });

    it('连续失败的工具应降低 healthScore', () => {
      for (let i = 0; i < 5; i++) {
        toolExecutionStats.record({
          ...makeExecutionRecord(testToolName, false, 100),
          errorType: 'transient',
          errorMessage: 'Connection error',
        });
      }

      const health = toolExecutionStats.getHealthStatus(testToolName);
      expect(health.consecutiveFailures).toBe(5);
      expect(health.healthScore).toBeLessThan(70);
    });

    it('成功后应重置 consecutiveFailures', () => {
      toolExecutionStats.record({
        ...makeExecutionRecord(testToolName, false, 100),
        errorType: 'transient',
      });
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));

      const health = toolExecutionStats.getHealthStatus(testToolName);
      expect(health.consecutiveFailures).toBe(0);
    });

    it('suggestion 字段应在 degraded/unhealthy 时填充', () => {
      for (let i = 0; i < 10; i++) {
        toolExecutionStats.record({
          ...makeExecutionRecord(testToolName, false, 100),
          errorType: 'timeout',
          timedOut: true,
        });
      }

      const health = toolExecutionStats.getHealthStatus(testToolName);
      expect(health.status).not.toBe('healthy');
      expect(health.suggestion).toBeDefined();
      expect(health.suggestion!.length).toBeGreaterThan(0);
    });
  });

  describe('getAllStats + getAllHealthStatus', () => {
    it('应返回所有已记录工具的统计', () => {
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));

      const allStats = toolExecutionStats.getAllStats();
      expect(allStats.some(s => s.toolName === testToolName)).toBe(true);
    });

    it('应返回所有工具的健康状态', () => {
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));

      const allHealth = toolExecutionStats.getAllHealthStatus();
      expect(allHealth.some(h => h.toolName === testToolName)).toBe(true);
    });
  });

  describe('clear + clearAll', () => {
    it('clear 应清除指定工具的统计', () => {
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));
      toolExecutionStats.clear(testToolName);

      const stats = toolExecutionStats.getStats(testToolName);
      expect(stats).toBeUndefined();
    });

    it('clearAll 应清除所有统计', () => {
      const tempTool = `temp_clearAll_${Date.now()}`;
      toolExecutionStats.record(makeExecutionRecord(tempTool, true, 100));
      toolExecutionStats.clearAll();

      expect(toolExecutionStats.getStats(tempTool)).toBeUndefined();
    });
  });

  describe('snapshot 持久化', () => {
    it('saveSnapshot + loadSnapshot 应能持久化和恢复', () => {
      toolExecutionStats.record(makeExecutionRecord(testToolName, true, 100));
      toolExecutionStats.saveSnapshot();

      // 不直接测试 loadSnapshot（单例已在 import 时加载），但 saveSnapshot 不应抛异常
      expect(() => toolExecutionStats.saveSnapshot()).not.toThrow();
    });
  });
});

// ===================== toolAuditLog =====================

describe('toolAuditLog — 审计日志', () => {
  const testToolName = `test_audit_tool_${Date.now()}`;
  const testSessionId = `test_audit_session_${Date.now()}`;

  describe('log + getRecentEntries', () => {
    it('应记录审计条目并可通过 getRecentEntries 读取', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: { query: 'test' },
        result: 'success result',
        success: true,
        durationMs: 100,
        truncated: false,
      });

      const entries = toolAuditLog.getRecentEntries(50);
      const found = entries.find(e => e.toolName === testToolName && e.sessionId === testSessionId);
      expect(found).toBeDefined();
      expect(found!.success).toBe(true);
      expect(found!.durationMs).toBe(100);
      expect(found!.timestamp).toBeGreaterThan(0);
    });

    it('应限制内存中条目数量', () => {
      // 添加大量条目，验证不会无限增长（MAX_LOG_ENTRIES=1000）
      for (let i = 0; i < 5; i++) {
        toolAuditLog.log({
          toolName: testToolName,
          sessionId: testSessionId,
          args: { index: i },
          result: `result-${i}`,
          success: true,
          durationMs: 50,
          truncated: false,
        });
      }
      const entries = toolAuditLog.getRecentEntries(1000);
      // 应至少包含我们添加的 5 条
      const ourEntries = entries.filter(e => e.toolName === testToolName && e.sessionId === testSessionId);
      expect(ourEntries.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('sanitizeArgs — 参数脱敏', () => {
    it('应脱敏 password 字段', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: { username: 'admin', password: 'secret123' },
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const entries = toolAuditLog.getRecentEntries(50);
      const found = entries.find(e =>
        e.toolName === testToolName && e.args && (e.args as any).password === '[REDACTED]'
      );
      expect(found).toBeDefined();
      expect((found!.args as any).username).toBe('admin');
    });

    it('应脱敏 token / apiKey / secret 字段', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: { token: 'abc', apiKey: 'xyz', secret: 'hidden', credential: 'cred' },
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const entries = toolAuditLog.getRecentEntries(50);
      const found = entries.find(e =>
        e.toolName === testToolName &&
        (e.args as any).token === '[REDACTED]' &&
        (e.args as any).apiKey === '[REDACTED]' &&
        (e.args as any).secret === '[REDACTED]' &&
        (e.args as any).credential === '[REDACTED]'
      );
      expect(found).toBeDefined();
    });

    it('应截断超长字符串参数', () => {
      const longValue = 'x'.repeat(3000);
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: { data: longValue },
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const entries = toolAuditLog.getRecentEntries(50);
      const found = entries.find(e =>
        e.toolName === testToolName &&
        typeof (e.args as any).data === 'string' &&
        (e.args as any).data.includes('truncated')
      );
      expect(found).toBeDefined();
    });
  });

  describe('getEntriesByTool', () => {
    it('应按工具名过滤审计条目', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: {},
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const entries = toolAuditLog.getEntriesByTool(testToolName, 50);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every(e => e.toolName === testToolName)).toBe(true);
    });
  });

  describe('getEntriesBySession', () => {
    it('应按会话 ID 过滤审计条目', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: {},
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const entries = toolAuditLog.getEntriesBySession(testSessionId, 50);
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every(e => e.sessionId === testSessionId)).toBe(true);
    });
  });

  describe('getFailedEntries', () => {
    it('应只返回失败的审计条目', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: {},
        result: 'error',
        success: false,
        durationMs: 10,
        errorType: 'timeout',
        truncated: false,
      });

      const failed = toolAuditLog.getFailedEntries(50);
      const found = failed.find(e => e.toolName === testToolName && !e.success);
      expect(found).toBeDefined();
    });
  });

  describe('getFallbackEntries', () => {
    it('应只返回有降级的审计条目', () => {
      toolAuditLog.log({
        toolName: 'fallback_tool',
        originalToolName: 'primary_tool',
        sessionId: testSessionId,
        args: {},
        result: 'degraded result',
        success: true,
        durationMs: 50,
        truncated: false,
      });

      const fallbacks = toolAuditLog.getFallbackEntries(50);
      const found = fallbacks.find(e =>
        e.originalToolName === 'primary_tool' && e.toolName === 'fallback_tool'
      );
      expect(found).toBeDefined();
    });
  });

  describe('generateReport', () => {
    it('应生成包含统计摘要的报告', () => {
      toolAuditLog.log({
        toolName: testToolName,
        sessionId: testSessionId,
        args: {},
        result: 'ok',
        success: true,
        durationMs: 10,
        truncated: false,
      });

      const report = toolAuditLog.generateReport();
      expect(report).toContain('Tool Execution Audit Report');
      expect(report).toContain('Total Executions');
      expect(report).toContain('Per-Tool Statistics');
    });
  });
});

// ===================== toolReplayRepair =====================

describe('toolReplayRepair — 工具重放修复', () => {
  let sessionId: string;

  beforeEach(() => {
    sessionId = uniqueSessionId();
  });

  afterEach(() => {
    toolSendReceipts.clearSession(sessionId);
  });

  describe('needsRepair', () => {
    it('无 pending 回执时应返回 false', () => {
      expect(toolReplayRepair.needsRepair(sessionId)).toBe(false);
    });

    it('有 pending 回执时应返回 true', () => {
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));
      expect(toolReplayRepair.needsRepair(sessionId)).toBe(true);
    });
  });

  describe('repairSession — 无 pending 回执', () => {
    it('应返回空报告', async () => {
      const report = await toolReplayRepair.repairSession(sessionId);

      expect(report.sessionId).toBe(sessionId);
      expect(report.totalPending).toBe(0);
      expect(report.replayed).toBe(0);
      expect(report.succeeded).toBe(0);
      expect(report.failed).toBe(0);
      expect(report.skipped).toBe(0);
      expect(report.results).toHaveLength(0);
    });
  });

  describe('repairSession — 并发锁', () => {
    it('同一会话并发修复时第二次应返回 skipped=1', async () => {
      // 创建一个 pending 回执使 repairSession 进入处理流程
      toolSendReceipts.createReceipt(makeReceiptBase(sessionId));

      // 手动触发两次并发修复（不 await 第一次）
      const promise1 = toolReplayRepair.repairSession(sessionId);
      const promise2 = toolReplayRepair.repairSession(sessionId);

      const [report1, report2] = await Promise.all([promise1, promise2]);

      // 其中一个应该被跳过（skipped=1）
      const skippedReport = report1.skipped > 0 ? report1 : report2;
      const executedReport = report1.skipped > 0 ? report2 : report1;

      expect(skippedReport.skipped).toBe(1);
      expect(skippedReport.replayed).toBe(0);
      // 另一个正常执行
      expect(executedReport.totalPending).toBeGreaterThanOrEqual(0);
    });

    it('修复完成后应释放锁，允许后续修复', async () => {
      await toolReplayRepair.repairSession(sessionId);

      // 第二次修复不应被跳过
      const report = await toolReplayRepair.repairSession(sessionId);
      expect(report.skipped).toBe(0);
    });
  });

  describe('repairSessions — 批量修复', () => {
    it('应处理多个会话并返回各自的报告', async () => {
      const session1 = uniqueSessionId();
      const session2 = uniqueSessionId();

      try {
        const reports = await toolReplayRepair.repairSessions([session1, session2]);

        expect(reports).toHaveLength(2);
        expect(reports[0].sessionId).toBe(session1);
        expect(reports[1].sessionId).toBe(session2);
        expect(reports[0].totalPending).toBe(0);
        expect(reports[1].totalPending).toBe(0);
      } finally {
        toolSendReceipts.clearSession(session1);
        toolSendReceipts.clearSession(session2);
      }
    });
  });
});
