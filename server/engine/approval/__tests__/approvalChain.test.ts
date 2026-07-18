/**
 * ApprovalChain 单元测试
 *
 * 覆盖：
 * - createChain/submit/getProgress/cancel/pause/resume
 * - 多级别顺序执行
 * - 风险等级未达阈值跳过级别
 * - 多批准人要求
 * - 自我批准禁止
 * - 链超时
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApprovalChain } from '../approvalChain.js';
import { ApprovalManager } from '../../approvalManager.js';
import type { ApprovalLevel } from '../approvalChain.js';

describe('ApprovalChain — 多级审批', () => {
  let manager: ApprovalManager;
  let chain: ApprovalChain;

  beforeEach(() => {
    manager = new ApprovalManager();
    manager.setConfig({ defaultTimeoutMs: 0 }); // 关闭默认超时，便于手动控制
    chain = new ApprovalChain({ approvalManager: manager });
  });

  // 1
  it('createChain 应返回 chainId 且支持 getProgress', () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'medium', timeoutMs: 5000, allowSelfApprove: true },
    ]);
    expect(id).toMatch(/^chain_/);
    const p = chain.getProgress(id);
    expect(p.totalLevels).toBe(1);
    expect(p.status).toBe('pending');
    expect(p.currentLevel).toBe(0);
    expect(p.completedLevels).toBe(0);
  });

  // 2
  it('createChain 拒绝空数组', () => {
    expect(() => chain.createChain([])).toThrow();
  });

  // 3
  it('createChain 拒绝非法配置（requiredApprovers<1）', () => {
    expect(() => chain.createChain([
      { name: 'L1', requiredApprovers: 0, minRiskLevel: 'low', timeoutMs: 1000, allowSelfApprove: true },
    ])).toThrow();
  });

  // 4
  it('单级：批准后链 approved', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'medium', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: { cmd: 'ls' },
      riskLevel: 'high',
      reason: '需要执行命令',
    });

    // 异步批准
    setTimeout(() => {
      const pending = manager.getPendingRequests();
      expect(pending.length).toBe(1);
      manager.approveRequest(pending[0].id, 'alice');
    }, 20);

    const result = await promise;
    expect(result.status).toBe('approved');
    expect(result.levels.length).toBe(1);
    expect(result.levels[0].status).toBe('approved');
    expect(result.levels[0].approvers).toContain('alice');
  });

  // 5
  it('风险等级低于阈值时跳过该级别', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'critical', timeoutMs: 5000, allowSelfApprove: true },
      { name: 'L2', requiredApprovers: 1, minRiskLevel: 'high', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    // 风险为 medium：L1 跳过、L2 跳过
    const result = await chain.submit(id, {
      toolName: 'read_file',
      toolArgs: {},
      riskLevel: 'medium',
      reason: '...',
    });
    expect(result.status).toBe('approved');
    expect(result.levels[0].triggered).toBe(false);
    expect(result.levels[1].triggered).toBe(false);
  });

  // 6
  it('多级：按顺序执行，第一级通过后进入第二级', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
      { name: 'L2', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: 'critical',
    });

    setTimeout(() => {
      const pending = manager.getPendingRequests();
      // 同一时间只应该有 L1 的一个 pending
      expect(pending.length).toBe(1);
      manager.approveRequest(pending[0].id, 'u1');
    }, 20);

    setTimeout(() => {
      const pending = manager.getPendingRequests();
      expect(pending.length).toBe(1);
      manager.approveRequest(pending[0].id, 'u2');
    }, 60);

    const result = await promise;
    expect(result.status).toBe('approved');
    expect(result.levels.length).toBe(2);
    expect(result.levels[0].status).toBe('approved');
    expect(result.levels[1].status).toBe('approved');
  });

  // 7
  it('多级：第一级被拒绝时链 rejected 且不进入下一级', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
      { name: 'L2', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
    });

    setTimeout(() => {
      const pending = manager.getPendingRequests();
      manager.rejectRequest(pending[0].id, '不安全', 'alice');
    }, 20);

    const result = await promise;
    expect(result.status).toBe('rejected');
    expect(result.levels[0].status).toBe('rejected');
    expect(result.levels.length).toBe(1);
  });

  // 8
  it('多批准人：requiredApprovers=2 时需两人批准', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 2, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
    });

    setTimeout(() => {
      const pending = manager.getPendingRequests();
      expect(pending.length).toBe(2);
      manager.approveRequest(pending[0].id, 'alice');
      manager.approveRequest(pending[1].id, 'bob');
    }, 20);

    const result = await promise;
    expect(result.status).toBe('approved');
    expect(result.levels[0].approvers).toContain('alice');
    expect(result.levels[0].approvers).toContain('bob');
  });

  // 9
  it('self-approve：禁止自我批准时视为拒绝', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: false },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
      requester: 'alice',
    });

    setTimeout(() => {
      const pending = manager.getPendingRequests();
      // alice 自己批准
      manager.approveRequest(pending[0].id, 'alice');
    }, 20);

    const result = await promise;
    expect(result.status).toBe('rejected');
    expect(result.levels[0].status).toBe('rejected');
  });

  // 10
  it('cancel：取消链会取消其 pending 请求', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
    });

    setTimeout(() => {
      chain.cancel(id);
    }, 20);

    const result = await promise;
    expect(result.status).toBe('cancelled');
  });

  // 11
  it('pause/resume：暂停后恢复能继续', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 5000, allowSelfApprove: true },
    ]);

    const promise = chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
    });

    setTimeout(() => {
      chain.pause(id);
      expect(chain.getProgress(id).status).toBe('paused');
      setTimeout(() => {
        chain.resume(id);
        const pending = manager.getPendingRequests();
        manager.approveRequest(pending[0].id, 'u1');
      }, 100);
    }, 20);

    const result = await promise;
    expect(result.status).toBe('approved');
  });

  // 12
  it('level 超时：级别内部超时返回 timeout', async () => {
    const id = chain.createChain([
      { name: 'L1', requiredApprovers: 1, minRiskLevel: 'low', timeoutMs: 30, allowSelfApprove: true },
    ]);

    const result = await chain.submit(id, {
      toolName: 'shell_exec',
      toolArgs: {},
      riskLevel: 'critical',
      reason: '...',
    });
    expect(result.status).toBe('timeout');
    expect(result.levels[0].status).toBe('timeout');
  });
});
