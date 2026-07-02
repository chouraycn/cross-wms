/**
 * Tool Policy Pipeline 单元测试
 *
 * 测试工具调度策略管线的各项功能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ToolPolicyPipeline,
  createPermissionPolicyHandler,
} from '../engine/toolPolicyPipeline.js';
import type { SkillPermissionConfig } from '../types/skill-runtime.js';

describe('ToolPolicyPipeline', () => {
  let pipeline: ToolPolicyPipeline;

  beforeEach(() => {
    pipeline = new ToolPolicyPipeline();
  });

  describe('基础功能', () => {
    it('应正确初始化默认层', () => {
      const stats = pipeline.getStats();
      expect(stats.totalLayers).toBe(9);
      expect(stats.enabledLayers).toBe(9);
    });

    it('应支持添加策略层', () => {
      pipeline.addLayer({
        name: 'custom',
        priority: 25,
        handler: () => undefined,
      });

      const stats = pipeline.getStats();
      expect(stats.totalLayers).toBe(10);
      expect(stats.layerNames).toContain('custom');
    });

    it('应支持移除策略层', () => {
      pipeline.removeLayer('profile');
      const stats = pipeline.getStats();
      expect(stats.totalLayers).toBe(8);
    });
  });

  describe('策略检查', () => {
    it('无任何策略时应使用全局配置（默认允许）', async () => {
      const result = await pipeline.check({
        toolName: 'test_tool',
        toolGroup: 'util',
      });

      expect(result.allowed).toBe(true);
      expect(result.decidedBy).toBe('global-config');
    });

    it('deny 策略应优先拒绝', async () => {
      const config: SkillPermissionConfig = {
        allow: [],
        deny: ['test_tool'],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      const result = await pipeline.check({
        toolName: 'test_tool',
        toolGroup: 'util',
      });

      expect(result.allowed).toBe(false);
    });

    it('allow 列表外的工具应被拒绝', async () => {
      const config: SkillPermissionConfig = {
        allow: ['allowed_tool'],
        deny: [],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      const result = await pipeline.check({
        toolName: 'other_tool',
        toolGroup: 'util',
      });

      expect(result.allowed).toBe(false);
    });

    it('通配符 * 应匹配所有', async () => {
      const config: SkillPermissionConfig = {
        allow: ['*'],
        deny: [],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      const result = await pipeline.check({
        toolName: 'any_tool',
        toolGroup: 'custom',
      });

      expect(result.allowed).toBe(true);
    });

    it('group:* 通配符应匹配组内所有工具', async () => {
      const config: SkillPermissionConfig = {
        allow: ['wms:*'],
        deny: [],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      const result = await pipeline.check({
        toolName: 'wms_query',
        toolGroup: 'wms',
      });

      expect(result.allowed).toBe(true);
    });
  });

  describe('策略层', () => {
    it('高优先级策略层应先执行', async () => {
      pipeline.setLayerHandler('profile', () => 'allow');
      pipeline.setLayerHandler('agent', () => 'deny');

      const result = await pipeline.check({
        toolName: 'test',
        toolGroup: 'util',
      });

      // profile 优先级高于 agent，应该返回 allow
      expect(result.allowed).toBe(true);
      expect(result.decidedBy).toBe('profile');
    });

    it('策略层返回 undefined 应继续下一层', async () => {
      pipeline.setLayerHandler('profile', () => undefined);
      pipeline.setLayerHandler('global', () => 'allow');

      const result = await pipeline.check({
        toolName: 'test',
        toolGroup: 'util',
      });

      expect(result.allowed).toBe(true);
      expect(result.decidedBy).toBe('global');
    });

    it('应支持禁用策略层', async () => {
      pipeline.setLayerHandler('profile', () => 'deny');
      pipeline.setLayerEnabled('profile', false);

      const result = await pipeline.check({
        toolName: 'test',
        toolGroup: 'util',
      });

      // profile 被禁用，应该继续到全局配置
      expect(result.allowed).toBe(true);
    });
  });

  describe('createPermissionPolicyHandler', () => {
    it('应创建基于权限配置的策略处理器', () => {
      const config: SkillPermissionConfig = {
        allow: ['wms:*'],
        deny: ['fs_write'],
        elevated: { enabled: 'ask' },
      };

      const handler = createPermissionPolicyHandler(config);

      // 允许的组
      expect(handler({ toolName: 'wms_query', toolGroup: 'wms' })).toBeUndefined();

      // 拒绝的工具
      expect(handler({ toolName: 'fs_write', toolGroup: 'fs_write' })).toBe('deny');

      // 不在 allow 列表中
      expect(handler({ toolName: 'other', toolGroup: 'custom' })).toBe('deny');
    });
  });

  describe('isAllowed 便捷方法', () => {
    it('应快速返回是否允许', async () => {
      const config: SkillPermissionConfig = {
        allow: ['util'],
        deny: [],
        elevated: { enabled: 'ask' },
      };
      pipeline.setGlobalConfig(config);

      const result1 = await pipeline.check({ toolName: 'calc', toolGroup: 'util' });
      expect(result1.allowed).toBe(true);
      expect(result1.decidedBy).toBe('global-config');

      const result2 = await pipeline.check({ toolName: 'reboot', toolGroup: 'system' });
      expect(result2.allowed).toBe(false);
      expect(result2.decidedBy).toBe('global-config');

      // 同时验证 isAllowed 便捷方法
      expect(await pipeline.isAllowed('calc', 'util')).toBe(true);
      expect(await pipeline.isAllowed('reboot', 'system')).toBe(false);
    });
  });
});
