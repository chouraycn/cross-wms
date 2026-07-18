/**
 * Approval API E2E 测试
 *
 * 测试 ApprovalManager 审批管理器的核心功能，
 * 包括创建审批请求、批准、拒绝、超时处理等。
 *
 * 契约以真实后端 server/engine/approvalManager.ts 为准：
 * - createRequest: 创建审批请求
 * - approveRequest: 批准请求
 * - rejectRequest: 拒绝请求
 * - cancelRequest: 取消请求
 * - getRequest: 获取请求详情
 * - getPendingRequests: 获取待审批列表
 * - waitForApproval: 等待审批结果
 * - cleanupExpired: 清理超时请求
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ApprovalManager } from '../../server/engine/approvalManager.js';

describe('Approval API E2E 测试', () => {
  let manager: ApprovalManager;

  beforeEach(() => {
    manager = new ApprovalManager();
    manager.setConfig({
      defaultTimeoutMs: 5000,
      mode: 'manual',
    });
  });

  afterEach(() => {
    manager.stopCleanupTimer();
  });

  describe('创建审批请求', () => {
    it('应该创建 pending 状态的审批请求', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'ls -la' },
        'high',
        '需要执行终端命令',
        'session-123',
        'tester',
      );

      expect(request).toBeDefined();
      expect(request.id).toBeTruthy();
      expect(request.toolName).toBe('shell_exec');
      expect(request.riskLevel).toBe('high');
      expect(request.status).toBe('pending');
      expect(request.reason).toBe('需要执行终端命令');
      expect(request.sessionId).toBe('session-123');
      expect(request.requester).toBe('tester');
      expect(request.createdAt).toBeGreaterThan(0);
    });

    it('应该为请求设置超时时间', () => {
      manager.setConfig({ defaultTimeoutMs: 10000 });
      const request = manager.createRequest(
        'file_write',
        { path: '/tmp/test.txt' },
        'medium',
        '写入文件',
      );

      expect(request.timeoutAt).toBeDefined();
      expect(request.timeoutAt!).toBeGreaterThan(Date.now());
    });

    it('auto_approve_all 模式下应该自动批准', () => {
      manager.setConfig({ mode: 'auto_approve_all' });
      const request = manager.createRequest(
        'safe_tool',
        {},
        'critical',
        '测试自动批准',
      );

      expect(request.status).toBe('approved');
      expect(request.approvedAt).toBeDefined();
    });

    it('auto_approve_safe 模式下 safe/low 风险应该自动批准', () => {
      manager.setConfig({ mode: 'auto_approve_safe' });

      const safeRequest = manager.createRequest(
        'safe_tool',
        {},
        'safe',
        '安全操作',
      );
      expect(safeRequest.status).toBe('approved');

      const lowRequest = manager.createRequest(
        'low_tool',
        {},
        'low',
        '低风险操作',
      );
      expect(lowRequest.status).toBe('approved');

      const highRequest = manager.createRequest(
        'high_tool',
        {},
        'high',
        '高风险操作',
      );
      expect(highRequest.status).toBe('pending');
    });

    it('应该检查会话待审批上限', () => {
      manager.setConfig({ maxPendingPerSession: 2, defaultTimeoutMs: 0 });

      manager.createRequest('tool1', {}, 'low', '请求1', 'session-1');
      manager.createRequest('tool2', {}, 'low', '请求2', 'session-1');

      expect(() => {
        manager.createRequest('tool3', {}, 'low', '请求3', 'session-1');
      }).toThrow('待审批请求已达上限');
    });
  });

  describe('批准审批', () => {
    it('应该批准 pending 状态的请求', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'ls' },
        'high',
        '测试批准',
      );

      const approved = manager.approveRequest(request.id, 'approver-user');
      expect(approved.status).toBe('approved');
      expect(approved.approvedAt).toBeGreaterThan(0);
      expect(approved.approver).toBe('approver-user');
    });

    it('批准后请求应该可以通过 getRequest 获取', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'ls' },
        'high',
        '测试批准',
      );

      manager.approveRequest(request.id);
      const found = manager.getRequest(request.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('approved');
    });

    it('应该在批准时触发 request_approved 事件', () => {
      let eventFired = false;
      manager.on('request_approved', () => {
        eventFired = true;
      });

      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'ls' },
        'high',
        '测试事件',
      );
      manager.approveRequest(request.id);

      expect(eventFired).toBe(true);
    });

    it('批准非 pending 状态的请求应该抛出错误', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'ls' },
        'high',
        '测试',
      );
      manager.approveRequest(request.id);

      expect(() => {
        manager.approveRequest(request.id);
      }).toThrow('无法批准');
    });

    it('批准不存在的请求应该抛出错误', () => {
      expect(() => {
        manager.approveRequest('nonexistent-id');
      }).toThrow('审批请求不存在');
    });
  });

  describe('拒绝审批', () => {
    it('应该拒绝 pending 状态的请求', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'rm -rf /' },
        'critical',
        '危险操作',
      );

      const rejected = manager.rejectRequest(
        request.id,
        '操作太危险',
        'reject-user',
      );

      expect(rejected.status).toBe('rejected');
      expect(rejected.rejectedAt).toBeGreaterThan(0);
      expect(rejected.rejectReason).toBe('操作太危险');
      expect(rejected.approver).toBe('reject-user');
    });

    it('拒绝后请求状态应该更新', () => {
      const request = manager.createRequest(
        'shell_exec',
        { cmd: 'rm' },
        'high',
        '测试拒绝',
      );

      manager.rejectRequest(request.id, '不允许执行');
      const found = manager.getRequest(request.id);
      expect(found!.status).toBe('rejected');
    });

    it('拒绝非 pending 状态的请求应该抛出错误', () => {
      const request = manager.createRequest(
        'tool',
        {},
        'low',
        '测试',
      );
      manager.approveRequest(request.id);

      expect(() => {
        manager.rejectRequest(request.id);
      }).toThrow('无法拒绝');
    });
  });

  describe('超时处理', () => {
    it('请求应该在超时后自动变为 timeout 状态', async () => {
      manager.setConfig({ defaultTimeoutMs: 100 });
      const request = manager.createRequest(
        'slow_tool',
        {},
        'medium',
        '测试超时',
      );

      expect(request.status).toBe('pending');
      expect(request.timeoutAt).toBeDefined();

      await new Promise(resolve => setTimeout(resolve, 200));

      const found = manager.getRequest(request.id);
      expect(found).toBeDefined();
      expect(found!.status).toBe('timeout');
    });

    it('cleanupExpired 应该清理过期请求', () => {
      manager.setConfig({ defaultTimeoutMs: 0 });
      const request = manager.createRequest(
        'slow_tool',
        {},
        'medium',
        '测试超时',
      );

      expect(request.status).toBe('pending');
      expect(request.timeoutAt).toBeUndefined();

      const count = manager.cleanupExpired();
      expect(count).toBe(0);
    });

    it('应该触发 request_timeout 事件', async () => {
      manager.setConfig({ defaultTimeoutMs: 100 });
      let timeoutEventFired = false;

      manager.on('request_timeout', () => {
        timeoutEventFired = true;
      });

      manager.createRequest('timeout_tool', {}, 'low', '超时测试');

      await new Promise(resolve => setTimeout(resolve, 200));

      expect(timeoutEventFired).toBe(true);
    });
  });

  describe('查询功能', () => {
    it('getRequest 应该返回请求详情', () => {
      const request = manager.createRequest(
        'test_tool',
        { param: 'value' },
        'low',
        '测试查询',
      );

      const found = manager.getRequest(request.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(request.id);
      expect(found!.toolName).toBe('test_tool');
    });

    it('getRequest 不存在时返回 undefined', () => {
      const found = manager.getRequest('nonexistent-id');
      expect(found).toBeUndefined();
    });

    it('getPendingRequests 应该返回待审批列表', () => {
      manager.setConfig({ defaultTimeoutMs: 0 });
      manager.createRequest('tool1', {}, 'low', '请求1', 'session-a');
      manager.createRequest('tool2', {}, 'medium', '请求2', 'session-a');
      manager.createRequest('tool3', {}, 'high', '请求3', 'session-b');

      const allPending = manager.getPendingRequests();
      expect(allPending.length).toBe(3);

      const sessionAPending = manager.getPendingRequests('session-a');
      expect(sessionAPending.length).toBe(2);

      const sessionBPending = manager.getPendingRequests('session-b');
      expect(sessionBPending.length).toBe(1);
    });

    it('getAllRequests 应该返回所有请求', () => {
      manager.setConfig({ defaultTimeoutMs: 0 });
      const req1 = manager.createRequest('tool1', {}, 'low', '请求1');
      const req2 = manager.createRequest('tool2', {}, 'low', '请求2');
      manager.approveRequest(req1.id);

      const all = manager.getAllRequests();
      expect(all.length).toBe(2);
    });
  });

  describe('等待审批', () => {
    it('waitForApproval 应该在批准时 resolve', async () => {
      const request = manager.createRequest(
        'wait_tool',
        {},
        'low',
        '测试等待批准',
      );

      setTimeout(() => {
        manager.approveRequest(request.id);
      }, 50);

      const result = await manager.waitForApproval(request.id);
      expect(result.status).toBe('approved');
    });

    it('waitForApproval 应该在拒绝时 resolve', async () => {
      const request = manager.createRequest(
        'wait_tool',
        {},
        'low',
        '测试等待拒绝',
      );

      setTimeout(() => {
        manager.rejectRequest(request.id, '拒绝原因');
      }, 50);

      const result = await manager.waitForApproval(request.id);
      expect(result.status).toBe('rejected');
    });

    it('waitForApproval 已终态请求应该立即 resolve', async () => {
      const request = manager.createRequest(
        'wait_tool',
        {},
        'low',
        '测试已终态',
      );
      manager.approveRequest(request.id);

      const result = await manager.waitForApproval(request.id);
      expect(result.status).toBe('approved');
    });

    it('waitForApproval 不存在的请求应该 reject', async () => {
      await expect(
        manager.waitForApproval('nonexistent-id'),
      ).rejects.toThrow('审批请求不存在');
    });
  });

  describe('取消审批', () => {
    it('应该取消 pending 状态的请求', () => {
      const request = manager.createRequest(
        'cancel_tool',
        {},
        'low',
        '测试取消',
      );

      const cancelled = manager.cancelRequest(request.id);
      expect(cancelled.status).toBe('cancelled');
    });

    it('取消后应该触发 request_cancelled 事件', () => {
      let cancelledEventFired = false;
      manager.on('request_cancelled', () => {
        cancelledEventFired = true;
      });

      const request = manager.createRequest(
        'cancel_tool',
        {},
        'low',
        '测试取消事件',
      );
      manager.cancelRequest(request.id);

      expect(cancelledEventFired).toBe(true);
    });
  });
});
