/**
 * ApprovalAudit 单元测试
 *
 * 覆盖：
 * - log/query/getStats/exportJsonl/exportMarkdown/clear
 * - 持久化初始化与失败回退
 * - maxInMemory 限制
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ApprovalAudit } from '../approvalAudit.js';
import type { AuditEntry } from '../approvalAudit.js';

describe('ApprovalAudit — 审批审计', () => {
  let audit: ApprovalAudit;

  beforeEach(() => {
    audit = new ApprovalAudit({ enablePersist: false });
  });

  afterEach(() => {
    audit.clear();
  });

  // 1
  it('log 应生成 id 并返回完整条目', () => {
    const entry = audit.log({
      requestId: 'req-1',
      toolName: 'shell_exec',
      riskLevel: 'high',
      action: 'created',
      reason: '执行命令',
      sessionId: 'session-A',
      approver: 'alice',
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(entry.requestId).toBe('req-1');
    expect(entry.toolName).toBe('shell_exec');
    expect(entry.riskLevel).toBe('high');
    expect(entry.timestamp).toBeGreaterThan(0);
  });

  // 2
  it('query 应支持多维度过滤', () => {
    const base: Omit<AuditEntry, 'id' | 'timestamp'> = {
      requestId: 'req-x',
      toolName: 'shell_exec',
      riskLevel: 'medium',
      action: 'approved',
      reason: '...',
      sessionId: 'session-1',
      approver: 'u-base',
    };
    audit.log({ ...base, toolName: 'shell_exec', sessionId: 'session-1', approver: 'alice' });
    audit.log({ ...base, toolName: 'file_write', sessionId: 'session-1', approver: 'alice' });
    audit.log({ ...base, toolName: 'shell_exec', sessionId: 'session-2', approver: 'alice' });
    audit.log({ ...base, toolName: 'shell_exec', sessionId: 'session-1', action: 'rejected', approver: 'bob' });
    audit.log({ ...base, toolName: 'shell_exec', sessionId: 'session-1', action: 'timeout', approver: 'u-base' });
    audit.log({ ...base, toolName: 'shell_exec', sessionId: 'session-1', action: 'cancelled', approver: 'u-base' });

    expect(audit.query({ toolName: 'shell_exec' }).length).toBe(5);
    expect(audit.query({ sessionId: 'session-1' }).length).toBe(5);
    expect(audit.query({ toolName: 'shell_exec', sessionId: 'session-1' }).length).toBe(4);
    expect(audit.query({ approver: 'alice' }).length).toBe(3);
    expect(audit.query({ approver: 'bob' }).length).toBe(1);
    expect(audit.query({ riskLevel: 'medium' }).length).toBe(6);
    expect(audit.query({}).length).toBe(6); // 空过滤返回全部
  });

  // 3
  it('query 应支持时间范围过滤', () => {
    const t1 = Date.now();
    audit.log({
      requestId: 'r1', toolName: 't', riskLevel: 'low', action: 'created', reason: 'r1', timestamp: t1,
    });
    const t2 = t1 + 100;
    audit.log({
      requestId: 'r2', toolName: 't', riskLevel: 'low', action: 'created', reason: 'r2', timestamp: t2,
    });
    const t3 = t1 + 200;
    audit.log({
      requestId: 'r3', toolName: 't', riskLevel: 'low', action: 'created', reason: 'r3', timestamp: t3,
    });

    const filtered = audit.query({ from: t2, to: t2 });
    expect(filtered.length).toBe(1);
    expect(filtered[0].requestId).toBe('r2');

    const filtered2 = audit.query({ from: t1, to: t3 });
    expect(filtered2.length).toBe(3);
  });

  // 4
  it('getStats 应正确分类', () => {
    audit.log({ requestId: 'r1', toolName: 'shell_exec', riskLevel: 'high', action: 'created', reason: 'r' });
    audit.log({ requestId: 'r1', toolName: 'shell_exec', riskLevel: 'high', action: 'approved', reason: 'r' });
    audit.log({ requestId: 'r2', toolName: 'file_write', riskLevel: 'medium', action: 'rejected', reason: 'r' });
    audit.log({ requestId: 'r3', toolName: 'shell_exec', riskLevel: 'critical', action: 'timeout', reason: 'r' });
    audit.log({ requestId: 'r4', toolName: 'file_write', riskLevel: 'low', action: 'cancelled', reason: 'r' });

    const stats = audit.getStats();
    expect(stats.total).toBe(5);
    expect(stats.approved).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.timeout).toBe(1);
    expect(stats.cancelled).toBe(1);
    expect(stats.byRiskLevel.high).toBe(2);
    expect(stats.byRiskLevel.medium).toBe(1);
    expect(stats.byRiskLevel.critical).toBe(1);
    expect(stats.byRiskLevel.low).toBe(1);
    expect(stats.byRiskLevel.safe).toBe(0);
    expect(stats.byTool['shell_exec']).toBe(3);
    expect(stats.byTool['file_write']).toBe(2);
  });

  // 5
  it('exportJsonl 应每行一条 JSON', () => {
    audit.log({ requestId: 'r1', toolName: 'a', riskLevel: 'low', action: 'created', reason: 'r1' });
    audit.log({ requestId: 'r2', toolName: 'b', riskLevel: 'high', action: 'approved', reason: 'r2' });

    const jsonl = audit.exportJsonl();
    const lines = jsonl.split('\n');
    expect(lines.length).toBe(2);
    const obj1 = JSON.parse(lines[0]);
    const obj2 = JSON.parse(lines[1]);
    expect(obj1.requestId).toBe('r1');
    expect(obj2.requestId).toBe('r2');
  });

  // 6
  it('exportMarkdown 应包含表头与明细', () => {
    audit.log({ requestId: 'r1', toolName: 'a', riskLevel: 'low', action: 'approved', reason: 'ok' });
    const md = audit.exportMarkdown();
    expect(md).toContain('# 审批审计报告');
    expect(md).toContain('## 状态分布');
    expect(md).toContain('## 风险等级分布');
    expect(md).toContain('## 工具分布');
    expect(md).toContain('## 审计明细');
    expect(md).toContain('| a |');
  });

  // 7
  it('clear 应清空所有记录', () => {
    audit.log({ requestId: 'r1', toolName: 'a', riskLevel: 'low', action: 'approved', reason: 'ok' });
    expect(audit.getAll().length).toBe(1);
    audit.clear();
    expect(audit.getAll().length).toBe(0);
  });

  // 8
  it('maxInMemory 应限制内存中条目数', () => {
    const limited = new ApprovalAudit({ enablePersist: false, maxInMemory: 3 });
    for (let i = 0; i < 5; i++) {
      limited.log({ requestId: `r${i}`, toolName: 't', riskLevel: 'low', action: 'created', reason: 'r' });
    }
    const all = limited.getAll();
    expect(all.length).toBe(3);
    // 最早的应该被丢弃
    expect(all[0].requestId).toBe('r2');
    expect(all[2].requestId).toBe('r4');
  });

  // 9
  it('持久化初始化失败时应回退内存模式（enablePersist 关闭）', () => {
    // 通过配置显式关闭持久化来模拟回退内存模式
    const a = new ApprovalAudit({
      enablePersist: false,
      persistPath: 'logs/anything.jsonl',
    });

    expect(a.isPersisted()).toBe(false);
    a.log({ requestId: 'r1', toolName: 't', riskLevel: 'low', action: 'created', reason: 'r' });
    a.log({ requestId: 'r2', toolName: 't', riskLevel: 'high', action: 'approved', reason: 'r' });
    expect(a.getAll().length).toBe(2);

    // 配置应可读
    const cfg = a.getConfig();
    expect(cfg.enablePersist).toBe(false);
  });

  // 10
  it('持久化启用时应写入 jsonl 文件', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-'));
    const filePath = path.join(tmpDir, 'audit.jsonl');

    const a = new ApprovalAudit({ enablePersist: true, persistPath: filePath });
    a.log({ requestId: 'r1', toolName: 't', riskLevel: 'low', action: 'created', reason: 'r' });
    a.log({ requestId: 'r2', toolName: 't', riskLevel: 'high', action: 'approved', reason: 'r' });

    expect(a.isPersisted()).toBe(true);
    expect(fs.existsSync(filePath)).toBe(true);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    expect(lines.length).toBe(2);
    const obj = JSON.parse(lines[0]);
    expect(obj.requestId).toBe('r1');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
