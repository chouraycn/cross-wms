/**
 * ApprovalPolicy 单元测试
 *
 * 覆盖：
 * - addRule/removeRule/getRule/setRuleEnabled
 * - evaluate 各操作符（exact/prefix/regex/in/gte/timeRange）
 * - 优先级与默认行为
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ApprovalPolicy } from '../approvalPolicy.js';
import type { PolicyRule, PolicyContext } from '../approvalPolicy.js';

describe('ApprovalPolicy — 审批策略引擎', () => {
  let policy: ApprovalPolicy;

  beforeEach(() => {
    policy = new ApprovalPolicy();
  });

  // 1
  it('addRule 应成功添加规则', () => {
    policy.addRule({
      id: 'r1',
      name: '禁止 rm',
      conditions: [{ field: 'toolName', operator: 'exact', value: 'rm' }],
      action: 'deny',
    });
    expect(policy.getAllRules().length).toBe(1);
    expect(policy.getRule('r1')?.name).toBe('禁止 rm');
  });

  // 2
  it('addRule 应拒绝空 conditions', () => {
    expect(() =>
      policy.addRule({
        id: 'r1',
        name: '...',
        conditions: [],
        action: 'deny',
      }),
    ).toThrow();
  });

  // 3
  it('removeRule 应返回是否成功', () => {
    policy.addRule({
      id: 'r1',
      name: '...',
      conditions: [{ field: 'toolName', operator: 'exact', value: 'a' }],
      action: 'deny',
    });
    expect(policy.removeRule('r1')).toBe(true);
    expect(policy.removeRule('r1')).toBe(false);
  });

  // 4
  it('setRuleEnabled 应能启用/禁用规则', () => {
    policy.addRule({
      id: 'r1',
      name: '...',
      conditions: [{ field: 'toolName', operator: 'exact', value: 'a' }],
      action: 'deny',
    });
    expect(policy.setRuleEnabled('r1', false)).toBe(true);
    const ctx: PolicyContext = { toolName: 'a' };
    expect(policy.evaluate(ctx).action).toBe('allow');
    policy.setRuleEnabled('r1', true);
    expect(policy.evaluate(ctx).action).toBe('deny');
  });

  // 5
  it('toolName exact 应匹配工具名', () => {
    policy.addRule({
      id: 'r1',
      name: '禁止 rm',
      conditions: [{ field: 'toolName', operator: 'exact', value: 'rm' }],
      action: 'deny',
    });
    expect(policy.evaluate({ toolName: 'rm' }).action).toBe('deny');
    expect(policy.evaluate({ toolName: 'rmdir' }).action).toBe('allow');
  });

  // 6
  it('toolName prefix 应匹配前缀', () => {
    policy.addRule({
      id: 'r1',
      name: 'shell_* 需审批',
      conditions: [{ field: 'toolName', operator: 'prefix', value: 'shell_' }],
      action: 'require_approval',
    });
    const dec = policy.evaluate({ toolName: 'shell_exec' });
    expect(dec.action).toBe('require_approval');
    expect(policy.evaluate({ toolName: 'file_read' }).action).toBe('allow');
  });

  // 7
  it('toolName regex 应支持正则匹配', () => {
    policy.addRule({
      id: 'r1',
      name: '危险工具',
      conditions: [{ field: 'toolName', operator: 'regex', value: '^(rm|delete|destroy)_' }],
      action: 'deny',
    });
    expect(policy.evaluate({ toolName: 'rm_file' }).action).toBe('deny');
    expect(policy.evaluate({ toolName: 'delete_record' }).action).toBe('deny');
    expect(policy.evaluate({ toolName: 'safe_tool' }).action).toBe('allow');
  });

  // 8
  it('sessionId exact 应匹配会话 ID', () => {
    policy.addRule({
      id: 'r1',
      name: '特定会话需审批',
      conditions: [{ field: 'sessionId', operator: 'exact', value: 'admin-session' }],
      action: 'require_approval',
    });
    expect(policy.evaluate({ toolName: 'a', sessionId: 'admin-session' }).action).toBe('require_approval');
    expect(policy.evaluate({ toolName: 'a', sessionId: 'user-session' }).action).toBe('allow');
  });

  // 9
  it('requester in 应匹配白名单', () => {
    policy.addRule({
      id: 'r1',
      name: '信任用户自动放行',
      conditions: [{ field: 'requester', operator: 'in', value: ['alice', 'bob'] }],
      action: 'allow',
      priority: 0,
    });
    policy.addRule({
      id: 'r2',
      name: '其他用户需审批',
      conditions: [{ field: 'requester', operator: 'in', value: ['charlie', 'dave'] }],
      action: 'require_approval',
      priority: 10,
    });
    // alice 命中 allow（priority 0）
    expect(policy.evaluate({ toolName: 't', requester: 'alice' }).action).toBe('allow');
    // charlie 命中 require_approval（priority 10）
    expect(policy.evaluate({ toolName: 't', requester: 'charlie' }).action).toBe('require_approval');
    // 无人命中，默认 allow
    expect(policy.evaluate({ toolName: 't', requester: 'eve' }).action).toBe('allow');
  });

  // 10
  it('riskLevel gte 应按等级生效', () => {
    policy.addRule({
      id: 'r1',
      name: '高风险需审批',
      conditions: [{ field: 'riskLevel', operator: 'gte', value: 'high' }],
      action: 'require_approval',
    });
    expect(policy.evaluate({ toolName: 't', riskLevel: 'critical' }).action).toBe('require_approval');
    expect(policy.evaluate({ toolName: 't', riskLevel: 'high' }).action).toBe('require_approval');
    expect(policy.evaluate({ toolName: 't', riskLevel: 'medium' }).action).toBe('allow');
    expect(policy.evaluate({ toolName: 't', riskLevel: 'safe' }).action).toBe('allow');
  });

  // 11
  it('timeRange 应按时间范围生效', () => {
    policy.addRule({
      id: 'r1',
      name: '夜间禁止执行',
      conditions: [{ field: 'timeRange', operator: 'timeRange', value: '22:00-06:00' }],
      action: 'deny',
    });
    // 模拟凌晨 03:00
    const nightTs = new Date('2025-01-01T03:00:00').getTime();
    // 模拟中午 12:00
    const dayTs = new Date('2025-01-01T12:00:00').getTime();

    expect(policy.evaluate({ toolName: 't', now: nightTs }).action).toBe('deny');
    expect(policy.evaluate({ toolName: 't', now: dayTs }).action).toBe('allow');
  });

  // 12
  it('多条件 AND：所有条件都需满足', () => {
    policy.addRule({
      id: 'r1',
      name: '高风险 shell 在指定会话',
      conditions: [
        { field: 'toolName', operator: 'prefix', value: 'shell_' },
        { field: 'riskLevel', operator: 'gte', value: 'high' },
        { field: 'sessionId', operator: 'exact', value: 's1' },
      ],
      action: 'require_approval',
    });
    expect(policy.evaluate({ toolName: 'shell_exec', riskLevel: 'high', sessionId: 's1' }).action).toBe('require_approval');
    expect(policy.evaluate({ toolName: 'shell_exec', riskLevel: 'medium', sessionId: 's1' }).action).toBe('allow');
    expect(policy.evaluate({ toolName: 'shell_exec', riskLevel: 'high', sessionId: 's2' }).action).toBe('allow');
    expect(policy.evaluate({ toolName: 'file_read', riskLevel: 'high', sessionId: 's1' }).action).toBe('allow');
  });

  // 13 (bonus 超出 12 例，做覆盖：决策字段与默认 allow)
  it('evaluate 返回的决策应包含规则元信息', () => {
    const rule: PolicyRule = {
      id: 'r1',
      name: '测试',
      conditions: [{ field: 'toolName', operator: 'exact', value: 'shell_exec' }],
      action: 'require_approval',
      approvers: ['alice', 'bob'],
      riskLevel: 'high',
    };
    policy.addRule(rule);
    const dec = policy.evaluate({ toolName: 'shell_exec' });
    expect(dec.ruleId).toBe('r1');
    expect(dec.ruleName).toBe('测试');
    expect(dec.approvers).toEqual(['alice', 'bob']);
    expect(dec.riskLevel).toBe('high');
    expect(dec.reason).toContain('测试');

    const noRule = policy.evaluate({ toolName: 'something_else' });
    expect(noRule.action).toBe('allow');
    expect(noRule.ruleId).toBeNull();
  });
});
