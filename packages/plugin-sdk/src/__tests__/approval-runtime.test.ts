/**
 * ApprovalRuntime 契约测试
 *
 * 覆盖审批流程管理：
 * - 请求审批
 * - 策略设置与获取
 * - 审计日志记录
 * - 自动审批/拒绝列表
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ApprovalRuntime } from '../approval-runtime.js';
import type { ApprovalPolicy } from '../types.js';

describe('ApprovalRuntime Contract', () => {
  describe('requestApproval', () => {
    it('请求审批返回结果', async () => {
      const runtime = new ApprovalRuntime();
      const result = await runtime.requestApproval('test-tool', { arg1: 'value1' });

      expect(result).toHaveProperty('approved');
      expect(result).toHaveProperty('timestamp');
    });

    it('触发 approval_requested 事件', async () => {
      const runtime = new ApprovalRuntime();
      const handler = vi.fn();
      runtime.on('approval_requested', handler);

      await runtime.requestApproval('evt-tool', {});

      expect(handler).toHaveBeenCalled();
      expect(handler.mock.calls[0][0].toolName).toBe('evt-tool');
    });

    it('触发 approval_completed 事件', async () => {
      const runtime = new ApprovalRuntime();
      const handler = vi.fn();
      runtime.on('approval_completed', handler);

      await runtime.requestApproval('complete-tool', {});

      expect(handler).toHaveBeenCalled();
    });
  });

  describe('setPolicy / getPolicy', () => {
    it('设置并获取策略', () => {
      const runtime = new ApprovalRuntime();
      const policy: ApprovalPolicy = {
        mode: 'auto',
        timeout: 30000,
      };

      runtime.setPolicy(policy);
      const retrieved = runtime.getPolicy();

      expect(retrieved.mode).toBe('auto');
      expect(retrieved.timeout).toBe(30000);
    });

    it('触发 policy_changed 事件', () => {
      const runtime = new ApprovalRuntime();
      const handler = vi.fn();
      runtime.on('policy_changed', handler);

      runtime.setPolicy({ mode: 'interactive' });

      expect(handler).toHaveBeenCalled();
    });

    it('getPolicy 返回策略副本', () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({ mode: 'manual' });

      const policy1 = runtime.getPolicy();
      const policy2 = runtime.getPolicy();

      expect(policy1).not.toBe(policy2); // 不同引用
      expect(policy1.mode).toBe(policy2.mode);
    });
  });

  describe('自动审批列表', () => {
    it('autoApprove 列表中的工具自动批准', async () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({
        mode: 'manual',
        autoApprove: ['safe-tool'],
      });

      const result = await runtime.requestApproval('safe-tool', {});

      expect(result.approved).toBe(true);
      expect(result.reason).toContain('Auto-approved');
    });

    it('autoReject 列表中的工具自动拒绝', async () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({
        mode: 'manual',
        autoReject: ['dangerous-tool'],
      });

      const result = await runtime.requestApproval('dangerous-tool', {});

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('Auto-rejected');
    });
  });

  describe('审批模式', () => {
    it('auto 模式自动批准所有请求', async () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({ mode: 'auto' });

      const result = await runtime.requestApproval('any-tool', {});

      expect(result.approved).toBe(true);
    });

    it('manual 模式需要手动审批', async () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({ mode: 'manual' });

      const result = await runtime.requestApproval('manual-tool', {});

      expect(result).toHaveProperty('approved');
    });

    it('interactive 模式处理确认列表', async () => {
      const runtime = new ApprovalRuntime();
      runtime.setPolicy({
        mode: 'interactive',
        requireConfirmation: ['sensitive-tool'],
      });

      const result = await runtime.requestApproval('sensitive-tool', {});

      expect(result.approved).toBe(false);
      expect(result.reason).toContain('confirmation');
    });
  });

  describe('审计日志', () => {
    it('记录审批请求', async () => {
      const runtime = new ApprovalRuntime();

      await runtime.requestApproval('audit-tool', { test: true });

      const entries = runtime.getEntries({ toolName: 'audit-tool' });
      expect(entries.length).toBeGreaterThan(0);
    });

    it('清空审计日志', async () => {
      const runtime = new ApprovalRuntime();

      await runtime.requestApproval('clear-tool', {});
      runtime.clear();

      const entries = runtime.getEntries();
      expect(entries).toHaveLength(0);
    });

    it('按时间范围过滤日志', async () => {
      const runtime = new ApprovalRuntime();
      const before = Date.now();

      await runtime.requestApproval('time-tool', {});

      const entries = runtime.getEntries({ from: before });
      expect(entries.length).toBeGreaterThan(0);
    });
  });

  describe('getPendingRequests', () => {
    it('获取待处理请求列表', async () => {
      const runtime = new ApprovalRuntime();

      // 在处理过程中检查
      const pending = runtime.getPendingRequests();
      expect(Array.isArray(pending)).toBe(true);
    });
  });

  describe('auditLog 接口', () => {
    it('auditLog 返回 AuditLogger 实例', () => {
      const runtime = new ApprovalRuntime();
      const logger = runtime.auditLog;

      expect(logger).toHaveProperty('log');
      expect(logger).toHaveProperty('getEntries');
      expect(logger).toHaveProperty('clear');
    });
  });
});