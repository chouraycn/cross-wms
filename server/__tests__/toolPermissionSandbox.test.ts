/**
 * ToolPermissionSandbox 单元测试
 *
 * v6.0: P2-1 工具权限沙箱
 * - 4级权限：allow / confirm / deny / high-risk
 * - deny 列表优先级最高
 * - 动态条件 > 静态规则 > 默认 confirm
 * - needsConfirmation 逻辑
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolPermissionSandbox,
  PermissionRule,
  DynamicPermissionCondition,
  PermissionContext,
} from '../engine/toolPermissionSandbox.js';

describe('ToolPermissionSandbox', () => {
  let sandbox: ToolPermissionSandbox;

  beforeEach(() => {
    sandbox = new ToolPermissionSandbox();
  });

  describe('默认静态规则', () => {
    it('system_info 应为 allow 权限', () => {
      const decision = sandbox.getPermission('system_info');
      expect(decision.permission).toBe('allow');
      expect(decision.source).toBe('static');
      expect(decision.needsConfirmation).toBe(false);
    });

    it('file_readFile 应为 allow 权限', () => {
      const decision = sandbox.getPermission('file_readFile');
      expect(decision.permission).toBe('allow');
      expect(decision.source).toBe('static');
      expect(decision.needsConfirmation).toBe(false);
    });

    it('shell_exec 应为 confirm 权限', () => {
      const decision = sandbox.getPermission('shell_exec');
      expect(decision.permission).toBe('confirm');
      expect(decision.source).toBe('static');
      expect(decision.needsConfirmation).toBe(true);
    });

    it('desktop_click 应为 high-risk 权限', () => {
      const decision = sandbox.getPermission('desktop_click');
      expect(decision.permission).toBe('high-risk');
      expect(decision.source).toBe('static');
      expect(decision.needsConfirmation).toBe(true);
    });

    it('未知工具应返回默认 confirm 权限', () => {
      const decision = sandbox.getPermission('totally_unknown_tool');
      expect(decision.permission).toBe('confirm');
      expect(decision.source).toBe('default');
      expect(decision.needsConfirmation).toBe(true);
      expect(decision.reason).toContain('未知工具');
    });
  });

  describe('自定义规则覆盖', () => {
    it('自定义规则可覆盖默认规则', () => {
      const customSandbox = new ToolPermissionSandbox([
        { toolName: 'shell_exec', permission: 'allow' },
      ]);
      const decision = customSandbox.getPermission('shell_exec');
      expect(decision.permission).toBe('allow');
      expect(decision.needsConfirmation).toBe(false);
    });

    it('自定义规则可追加新工具', () => {
      const customSandbox = new ToolPermissionSandbox([
        { toolName: 'my_custom_tool', permission: 'deny' },
      ]);
      const decision = customSandbox.getPermission('my_custom_tool');
      expect(decision.permission).toBe('deny');
      expect(decision.source).toBe('static');
    });
  });

  describe('deny 列表优先级', () => {
    it('deny 列表优先级高于静态规则', () => {
      sandbox.denyTool('system_info');
      const decision = sandbox.getPermission('system_info');
      expect(decision.permission).toBe('deny');
      expect(decision.source).toBe('dynamic');
      expect(decision.needsConfirmation).toBe(false);
    });

    it('deny 列表优先级高于动态条件', () => {
      sandbox.addDynamicCondition({
        name: 'test_cond',
        toolName: 'shell_exec',
        condition: () => true,
        permissionIfTrue: 'allow',
      });
      sandbox.denyTool('shell_exec');
      const context: PermissionContext = {
        complexityLevel: 'simple',
        currentTurn: 1,
        executedTools: [],
        userMessage: 'test',
      };
      const decision = sandbox.getPermission('shell_exec', context);
      expect(decision.permission).toBe('deny');
    });

    it('allowTool 可移除 deny', () => {
      sandbox.denyTool('system_info');
      expect(sandbox.getPermission('system_info').permission).toBe('deny');
      sandbox.allowTool('system_info');
      expect(sandbox.getPermission('system_info').permission).toBe('allow');
    });
  });

  describe('动态条件', () => {
    const createContext = (complexity: 'simple' | 'moderate' | 'complex' = 'simple'): PermissionContext => ({
      complexityLevel: complexity,
      currentTurn: 1,
      executedTools: [],
      userMessage: 'test message',
    });

    it('动态条件匹配时返回 permissionIfTrue', () => {
      sandbox.addDynamicCondition({
        name: 'complexity_check',
        toolName: 'shell_exec',
        condition: (ctx) => ctx.complexityLevel === 'complex',
        permissionIfTrue: 'deny',
      });
      const context = createContext('complex');
      const decision = sandbox.getPermission('shell_exec', context);
      expect(decision.permission).toBe('deny');
      expect(decision.source).toBe('dynamic');
    });

    it('动态条件不匹配时返回 permissionIfFalse', () => {
      sandbox.addDynamicCondition({
        name: 'complexity_check',
        toolName: 'shell_exec',
        condition: (ctx) => ctx.complexityLevel === 'complex',
        permissionIfTrue: 'deny',
        permissionIfFalse: 'allow',
      });
      const context = createContext('simple');
      const decision = sandbox.getPermission('shell_exec', context);
      expect(decision.permission).toBe('allow');
      expect(decision.source).toBe('dynamic');
    });

    it('动态条件不匹配且无 permissionIfFalse 时回退到静态规则', () => {
      sandbox.addDynamicCondition({
        name: 'complexity_check',
        toolName: 'shell_exec',
        condition: (ctx) => ctx.complexityLevel === 'complex',
        permissionIfTrue: 'deny',
      });
      const context = createContext('simple');
      const decision = sandbox.getPermission('shell_exec', context);
      expect(decision.permission).toBe('confirm');
      expect(decision.source).toBe('static');
    });

    it('无 context 时跳过动态条件', () => {
      sandbox.addDynamicCondition({
        name: 'complexity_check',
        toolName: 'shell_exec',
        condition: () => true,
        permissionIfTrue: 'allow',
      });
      const decision = sandbox.getPermission('shell_exec');
      // 无 context → 跳过动态条件 → 回到静态规则
      expect(decision.permission).toBe('confirm');
      expect(decision.source).toBe('static');
    });
  });

  describe('updateRule', () => {
    it('可动态更新静态规则', () => {
      sandbox.updateRule({ toolName: 'system_info', permission: 'deny' });
      const decision = sandbox.getPermission('system_info');
      expect(decision.permission).toBe('deny');
      expect(decision.source).toBe('static');
    });
  });

  describe('reset', () => {
    it('reset 清空 deny 列表和动态条件', () => {
      sandbox.denyTool('shell_exec');
      sandbox.addDynamicCondition({
        name: 'test',
        toolName: 'shell_exec',
        condition: () => true,
        permissionIfTrue: 'deny',
      });

      sandbox.reset();

      // deny 列表已清空，动态条件已移除，回到静态规则
      const decision = sandbox.getPermission('shell_exec');
      expect(decision.permission).toBe('confirm');
      expect(decision.source).toBe('static');
    });

    it('reset 不影响静态规则', () => {
      sandbox.updateRule({ toolName: 'system_info', permission: 'high-risk' });
      sandbox.denyTool('system_info');
      sandbox.reset();

      // deny 清空后回到更新后的静态规则
      const decision = sandbox.getPermission('system_info');
      expect(decision.permission).toBe('high-risk');
      expect(decision.source).toBe('static');
    });
  });
});
