/**
 * Skill Discovery 单元测试
 *
 * 测试 Skill 发现与索引系统的各项功能。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillDiscovery, normalizeSkillIndexName } from '../engine/skillDiscovery.js';
import type { RegisteredSkill, SkillDefinition } from '../types/skill-runtime.js';

// 创建测试用的 Skill
function createMockSkill(
  id: string,
  name: string,
  group: string,
  options: Partial<SkillDefinition> = {},
): RegisteredSkill {
  return {
    definition: {
      id,
      name,
      description: `${name} 的描述`,
      group: group as any,
      source: 'builtin',
      userInvocable: true,
      tags: [],
      ...options,
    },
    lifecycle: { execute: async () => ({ success: true }) },
    state: 'enabled',
    registeredAt: Date.now(),
    executionCount: 0,
  };
}

describe('SkillDiscovery', () => {
  let discovery: SkillDiscovery;

  beforeEach(() => {
    discovery = new SkillDiscovery();
  });

  describe('normalizeSkillIndexName', () => {
    it('应转换为小写', () => {
      expect(normalizeSkillIndexName('HelloWorld')).toBe('helloworld');
    });

    it('应移除空格', () => {
      expect(normalizeSkillIndexName('hello world')).toBe('helloworld');
    });

    it('应移除连字符和下划线', () => {
      expect(normalizeSkillIndexName('hello-world_test')).toBe('helloworldtest');
    });

    it('应移除特殊字符', () => {
      expect(normalizeSkillIndexName('hello@world!#')).toBe('helloworld');
    });

    it('应保留数字', () => {
      expect(normalizeSkillIndexName('skill123')).toBe('skill123');
    });
  });

  describe('buildIndex', () => {
    it('应正确构建索引', () => {
      const skills = [
        createMockSkill('calc', '计算器', 'util'),
        createMockSkill('wms_query', 'WMS查询', 'wms'),
      ];

      discovery.buildIndex(skills);

      const stats = discovery.getStats();
      expect(stats.total).toBe(2);
    });

    it('应正确设置可见性', () => {
      const skills = [
        createMockSkill('calc', '计算器', 'util'),
        createMockSkill('fs_read', '文件读取', 'fs_read'),
        createMockSkill('system_admin', '系统管理', 'system'),
      ];

      discovery.buildIndex(skills);

      const runtimeVisible = discovery.getVisibleSkills({ visibility: 'runtimeVisible' });
      const promptVisible = discovery.getVisibleSkills({ visibility: 'promptVisible' });

      expect(runtimeVisible.length).toBeGreaterThan(0);
      expect(promptVisible.length).toBeGreaterThan(0);
    });

    it('userInvocable=false 的 Skill 不应可见', () => {
      const skills = [
        createMockSkill('visible', '可见的', 'util'),
        createMockSkill('hidden', '隐藏的', 'util', { userInvocable: false }),
      ];

      discovery.buildIndex(skills);

      const results = discovery.getVisibleSkills({ visibility: 'userInvocable' });
      const ids = results.map((r) => r.skillId);

      expect(ids).toContain('visible');
      expect(ids).not.toContain('hidden');
    });
  });

  describe('getVisibleSkills', () => {
    beforeEach(() => {
      const skills = [
        createMockSkill('calc', '计算器', 'util', { tags: ['math', 'tool'] }),
        createMockSkill('wms_query', 'WMS查询', 'wms', { tags: ['wms', 'inventory'] }),
        createMockSkill('web_fetch', '网页获取', 'network', { tags: ['web', 'http'] }),
      ];
      discovery.buildIndex(skills);
    });

    it('应按 visibility 过滤', () => {
      const runtime = discovery.getVisibleSkills({ visibility: 'runtimeVisible' });
      const prompt = discovery.getVisibleSkills({ visibility: 'promptVisible' });

      expect(runtime.length).toBeGreaterThanOrEqual(prompt.length);
    });

    it('应按 group 过滤', () => {
      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        groups: ['wms'],
      });

      expect(results.length).toBe(1);
      expect(results[0].skillId).toBe('wms_query');
    });

    it('应按 tag 过滤', () => {
      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        tags: ['math'],
      });

      expect(results.length).toBe(1);
      expect(results[0].skillId).toBe('calc');
    });

    it('应按搜索关键词过滤', () => {
      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        search: 'WMS',
      });

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].skillId).toBe('wms_query');
    });
  });

  describe('findByName', () => {
    beforeEach(() => {
      const skills = [
        createMockSkill('calc', '计算器', 'util'),
        createMockSkill('calculator_pro', '专业计算器', 'util'),
      ];
      discovery.buildIndex(skills);
    });

    it('应支持精确名称匹配', () => {
      const results = discovery.findByName('计算器');
      expect(results.length).toBeGreaterThan(0);
    });

    it('应支持部分名称匹配', () => {
      const results = discovery.findByName('计算');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Agent 过滤', () => {
    beforeEach(() => {
      const skills = [
        createMockSkill('calc', '计算器', 'util', { tags: ['math', 'tool'] }),
        createMockSkill('wms_query', 'WMS查询', 'wms', { tags: ['wms', 'inventory'] }),
        createMockSkill('fs_read', '文件读取', 'fs_read', { tags: ['file', 'system'] }),
      ];
      discovery.buildIndex(skills);
    });

    it('应按 Agent allow 列表过滤', () => {
      discovery.setAgentFilter('wms-agent', {
        allow: ['wms:*'],
      });

      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        agentId: 'wms-agent',
      });

      const ids = results.map((r) => r.skillId);
      expect(ids).toContain('wms_query');
      expect(ids).not.toContain('calc');
    });

    it('应按 Agent deny 列表过滤', () => {
      discovery.setAgentFilter('no-fs-agent', {
        deny: ['fs_read'],
      });

      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        agentId: 'no-fs-agent',
      });

      const ids = results.map((r) => r.skillId);
      expect(ids).not.toContain('fs_read');
    });

    it('应支持按标签过滤', () => {
      discovery.setAgentFilter('math-agent', {
        tags: ['math'],
      });

      const results = discovery.getVisibleSkills({
        visibility: 'runtimeVisible',
        agentId: 'math-agent',
      });

      const ids = results.map((r) => r.skillId);
      expect(ids).toContain('calc');
    });
  });
});
