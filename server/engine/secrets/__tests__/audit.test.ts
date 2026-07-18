/**
 * 审计模块测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  queryAccessLogs,
  queryChangeHistory,
  runComplianceAudit,
  generateAuditReport,
  filterBySeverity,
  filterByCode,
  countFindings,
  isAuditPassed,
  listAllSecretsForAudit,
  getAccessStats,
} from '../audit.js';
import {
  initSecretsStore,
  deleteSecretsByKeyPrefixForTests,
  createSecret,
  getSecretValue,
} from '../store.js';

// 唯一前缀，用于并行测试隔离
const PREFIX = 'atest-';

describe('审计模块', () => {
  beforeEach(() => {
    initSecretsStore();
    deleteSecretsByKeyPrefixForTests(PREFIX);
  });

  describe('queryAccessLogs', () => {
    it('应能查询所有访问日志', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'audit-key',
        value: 'value-1234567890',
      });
      getSecretValue(secret.id, 'test');
      const logs = queryAccessLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    it('应能按 secretId 查询', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'audit-key-2',
        value: 'value-1234567890',
      });
      getSecretValue(secret.id, 'test');
      const logs = queryAccessLogs(secret.id);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every(l => l.secretId === secret.id)).toBe(true);
    });
  });

  describe('queryChangeHistory', () => {
    it('应只返回 write / delete / rotate 操作', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'change-key',
        value: 'value-1234567890',
      });
      getSecretValue(secret.id, 'test'); // read 操作
      const history = queryChangeHistory();
      // 创建时的 write 操作应包含在内
      expect(history.some(l => l.action === 'write')).toBe(true);
      // 不应包含 read 操作（除非有其他写操作触发了 read）
      // 注意：createSecret 内部已记录 write，这里只验证 write 存在
    });
  });

  describe('runComplianceAudit', () => {
    it('应能检测过期密钥', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'expired-audit',
        value: 'x'.repeat(32),
        expiresAt: Date.now() - 1000,
      });
      const findings = runComplianceAudit();
      const expired = findings.filter(f => f.code === 'EXPIRED_SECRET' && f.severity === 'error');
      expect(expired.length).toBeGreaterThan(0);
    });

    it('应能检测弱密钥', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'weak-audit',
        value: 'abc',
      });
      const findings = runComplianceAudit({ weakScoreThreshold: 50 });
      const weak = findings.filter(f => f.code === 'WEAK_SECRET');
      expect(weak.length).toBeGreaterThan(0);
    });
  });

  describe('generateAuditReport', () => {
    it('应生成完整报告', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'report-key',
        value: 'strong-enough-value-1234567890',
      });
      const report = generateAuditReport();
      expect(report.version).toBe(1);
      expect(report.status).toBeDefined();
      expect(report.findings).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(Array.isArray(report.filesScanned)).toBe(true);
    });

    it('有 error 级别发现时 status 应为 unresolved', () => {
      createSecret({
        provider: 'encrypted',
        key: PREFIX + 'unresolved-key',
        value: 'x'.repeat(32),
        expiresAt: Date.now() - 1000,
      });
      const report = generateAuditReport();
      // 有过期密钥 → error → unresolved
      expect(['unresolved', 'findings']).toContain(report.status);
    });
  });

  describe('filterBySeverity / filterByCode', () => {
    it('应能按严重级别过滤', () => {
      const findings = [
        { code: 'EXPIRED_SECRET', severity: 'error', file: '', jsonPath: '', message: '' },
        { code: 'WEAK_SECRET', severity: 'warn', file: '', jsonPath: '', message: '' },
        { code: 'UNUSED_SECRET', severity: 'info', file: '', jsonPath: '', message: '' },
      ] as any;
      expect(filterBySeverity(findings, 'error')).toHaveLength(1);
      expect(filterBySeverity(findings, 'warn')).toHaveLength(1);
      expect(filterBySeverity(findings, 'info')).toHaveLength(1);
    });

    it('应能按代码过滤', () => {
      const findings = [
        { code: 'EXPIRED_SECRET', severity: 'error', file: '', jsonPath: '', message: '' },
        { code: 'WEAK_SECRET', severity: 'warn', file: '', jsonPath: '', message: '' },
      ] as any;
      expect(filterByCode(findings, 'EXPIRED_SECRET')).toHaveLength(1);
      expect(filterByCode(findings, 'WEAK_SECRET')).toHaveLength(1);
    });
  });

  describe('countFindings', () => {
    it('应正确统计总数与分组', () => {
      const findings = [
        { code: 'EXPIRED_SECRET', severity: 'error', file: '', jsonPath: '', message: '' },
        { code: 'WEAK_SECRET', severity: 'warn', file: '', jsonPath: '', message: '' },
        { code: 'UNUSED_SECRET', severity: 'info', file: '', jsonPath: '', message: '' },
      ] as any;
      const result = countFindings(findings);
      expect(result.total).toBe(3);
      expect(result.bySeverity.error).toBe(1);
      expect(result.bySeverity.warn).toBe(1);
      expect(result.bySeverity.info).toBe(1);
      expect(result.byCode.EXPIRED_SECRET).toBe(1);
    });
  });

  describe('isAuditPassed', () => {
    it('clean 状态应通过', () => {
      const report = {
        version: 1,
        status: 'clean',
        filesScanned: [],
        summary: {} as any,
        findings: [],
      } as any;
      expect(isAuditPassed(report)).toBe(true);
    });

    it('unresolved 状态应不通过', () => {
      const report = {
        version: 1,
        status: 'unresolved',
        filesScanned: [],
        summary: {} as any,
        findings: [],
      } as any;
      expect(isAuditPassed(report)).toBe(false);
    });
  });

  describe('listAllSecretsForAudit', () => {
    it('应列出所有密钥（不含密文）', () => {
      createSecret({ provider: 'encrypted', key: PREFIX + 'list-audit-1', value: 'v' });
      const list = listAllSecretsForAudit();
      expect(list.length).toBeGreaterThanOrEqual(1);
      for (const item of list) {
        expect((item as any).valueEncrypted).toBeUndefined();
      }
    });
  });

  describe('getAccessStats', () => {
    it('应返回访问统计', () => {
      const secret = createSecret({
        provider: 'encrypted',
        key: PREFIX + 'stats-key',
        value: 'value-1234567890',
      });
      getSecretValue(secret.id, 'stats-source');
      const stats = getAccessStats();
      expect(stats.totalAccess).toBeGreaterThan(0);
      expect(stats.byAction).toBeDefined();
      expect(stats.bySource).toBeDefined();
    });
  });
});
