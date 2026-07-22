import { describe, it, expect, beforeEach } from 'vitest';
import { PermissionPolicyEngine } from '../permission-policy-engine.js';

describe('PermissionPolicyEngine', () => {
  let engine: PermissionPolicyEngine;

  beforeEach(() => {
    engine = new PermissionPolicyEngine({ enableLogging: false });
  });

  describe('默认策略', () => {
    it('未设置策略时应返回 allow', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'file.read',
      });
      expect(result.decision).toBe('allow');
    });
  });

  describe('setPolicy', () => {
    it('应能设置自定义策略', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: ['exec.shell'],
        requireApproval: ['file.write'],
      });

      const policy = engine.getPolicy('agent-1');
      expect(policy).toBeDefined();
      expect(policy?.allowed).toContain('file.read');
      expect(policy?.denied).toContain('exec.shell');
      expect(policy?.requireApproval).toContain('file.write');
    });
  });

  describe('grantPermission', () => {
    it('应能授予权限', () => {
      engine.grantPermission('agent-1', 'network.write');

      const policy = engine.getPolicy('agent-1');
      expect(policy?.allowed).toContain('network.write');
      expect(policy?.denied).not.toContain('network.write');
      expect(policy?.requireApproval).not.toContain('network.write');
    });

    it('授予权限应从 denied 中移除', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: [],
        denied: ['exec.shell'],
        requireApproval: [],
      });

      engine.grantPermission('agent-1', 'exec.shell');

      const policy = engine.getPolicy('agent-1');
      expect(policy?.allowed).toContain('exec.shell');
      expect(policy?.denied).not.toContain('exec.shell');
    });
  });

  describe('denyPermission', () => {
    it('应能拒绝权限', () => {
      engine.denyPermission('agent-1', 'file.read');

      const policy = engine.getPolicy('agent-1');
      expect(policy?.denied).toContain('file.read');
      expect(policy?.allowed).not.toContain('file.read');
    });

    it('拒绝权限应从 allowed 中移除', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: [],
        requireApproval: [],
      });

      engine.denyPermission('agent-1', 'file.read');

      const policy = engine.getPolicy('agent-1');
      expect(policy?.denied).toContain('file.read');
      expect(policy?.allowed).not.toContain('file.read');
    });
  });

  describe('requireApprovalFor', () => {
    it('应能设置需要审批的权限', () => {
      engine.requireApprovalFor('agent-1', 'subagent.spawn');

      const policy = engine.getPolicy('agent-1');
      expect(policy?.requireApproval).toContain('subagent.spawn');
      expect(policy?.allowed).not.toContain('subagent.spawn');
      expect(policy?.denied).not.toContain('subagent.spawn');
    });
  });

  describe('evaluate', () => {
    beforeEach(() => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read', 'tool.use'],
        denied: ['exec.shell'],
        requireApproval: ['file.write', 'network.write'],
      });
    });

    it('allowed 中的权限应返回 allow', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'file.read',
      });
      expect(result.decision).toBe('allow');
      expect(result.policySource).toBe('agent-1');
    });

    it('denied 中的权限应返回 deny', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'exec.shell',
      });
      expect(result.decision).toBe('deny');
      expect(result.reason).toContain('exec.shell');
    });

    it('requireApproval 中的权限应返回 approval', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'file.write',
      });
      expect(result.decision).toBe('approval');
      expect(result.reason).toContain('file.write');
    });

    it('未明确授权的权限应返回 deny', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'memory.write',
      });
      expect(result.decision).toBe('deny');
    });

    it('带 resource 的评估应包含在 reason 中', () => {
      const result = engine.evaluate({
        agentId: 'agent-1',
        permission: 'file.read',
        resource: '/etc/passwd',
      });
      expect(result.decision).toBe('allow');
      expect(result.reason).toContain('/etc/passwd');
    });
  });

  describe('checkPermission', () => {
    it('应返回简化决策结果', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: ['exec.shell'],
        requireApproval: ['file.write'],
      });

      expect(engine.checkPermission('agent-1', 'file.read')).toBe('allow');
      expect(engine.checkPermission('agent-1', 'exec.shell')).toBe('deny');
      expect(engine.checkPermission('agent-1', 'file.write')).toBe('approval');
    });
  });

  describe('clearPolicy', () => {
    it('应能清除策略', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: [],
        requireApproval: [],
      });

      engine.clearPolicy('agent-1');
      expect(engine.getPolicy('agent-1')).toBeUndefined();
    });
  });

  describe('getAllPolicies', () => {
    it('应返回所有策略', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: [],
        requireApproval: [],
      });
      engine.setPolicy({
        agentId: 'agent-2',
        allowed: ['tool.use'],
        denied: [],
        requireApproval: [],
      });

      const all = engine.getAllPolicies();
      expect(all).toHaveLength(2);
      expect(all.find((p) => p.agentId === 'agent-1')).toBeDefined();
      expect(all.find((p) => p.agentId === 'agent-2')).toBeDefined();
    });
  });

  describe('getPolicySnapshot', () => {
    it('应返回策略的深拷贝', () => {
      engine.setPolicy({
        agentId: 'agent-1',
        allowed: ['file.read'],
        denied: ['exec.shell'],
        requireApproval: ['file.write'],
      });

      const snapshot = engine.getPolicySnapshot('agent-1');
      expect(snapshot).toBeDefined();
      expect(snapshot?.allowed).toEqual(['file.read']);
      expect(snapshot?.denied).toEqual(['exec.shell']);

      // 修改快照不应影响原策略
      snapshot?.allowed.push('tool.use');
      const original = engine.getPolicy('agent-1');
      expect(original?.allowed).toEqual(['file.read']);
    });
  });
});