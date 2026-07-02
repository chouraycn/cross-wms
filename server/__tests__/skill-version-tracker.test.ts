/**
 * Skill Version Tracker 单元测试
 *
 * 测试 Skill 版本检测与变更追踪系统。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillVersionTracker } from '../engine/skillVersionTracker.js';
import type { RegisteredSkill, SkillDefinition } from '../types/skill-runtime.js';

// Mock skillRegistry
vi.mock('../engine/skillRegistry.js', () => ({
  skillRegistry: {
    getAllSkills: () => [],
    getSkill: (id: string) => null,
    reloadSkill: async () => true,
  },
}));

// Mock skillDiscoverySingleton
vi.mock('../engine/skillDiscoverySingleton.js', () => ({
  rebuildSkillIndex: () => {},
  initSkillDiscovery: () => {},
  skillDiscovery: {
    buildIndex: () => {},
  },
}));

function createMockSkill(id: string, content: string, version = '1.0.0'): RegisteredSkill {
  return {
    definition: {
      id,
      name: id,
      description: `${id} description`,
      group: 'util' as const,
      source: 'builtin',
      version,
      skillMdContent: content,
      instructionBlocks: [],
    },
    lifecycle: { execute: async () => ({ success: true }) },
    state: 'enabled',
    registeredAt: Date.now(),
    executionCount: 0,
  };
}

describe('SkillVersionTracker', () => {
  let tracker: SkillVersionTracker;

  beforeEach(() => {
    tracker = new SkillVersionTracker({ checkInterval: 1000 });
  });

  describe('generateContentHash', () => {
    it('应为相同内容生成相同的哈希', () => {
      const content = '# Test Skill\nThis is a test.';
      const hash1 = tracker.generateContentHash(content);
      const hash2 = tracker.generateContentHash(content);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(16);
    });

    it('应为不同内容生成不同的哈希', () => {
      const hash1 = tracker.generateContentHash('content A');
      const hash2 = tracker.generateContentHash('content B');

      expect(hash1).not.toBe(hash2);
    });

    it('空内容应返回全0的哈希', () => {
      const hash = tracker.generateContentHash('');
      expect(hash).toBe('0000000000000000');
    });
  });

  describe('trackSkill', () => {
    it('应正确追踪 Skill 版本', () => {
      const skill = createMockSkill('test_skill', '# Test\nContent');
      tracker.trackSkill(skill);

      const info = tracker.getVersionInfo('test_skill');
      expect(info).toBeDefined();
      expect(info?.skillId).toBe('test_skill');
      expect(info?.currentVersion.length).toBe(16);
      expect(info?.changeHistory.length).toBe(1);
      expect(info?.changeHistory[0].changeType).toBe('created');
    });
  });

  describe('getAllVersions', () => {
    it('应返回所有 Skill 的版本', () => {
      tracker.trackSkill(createMockSkill('skill_a', 'content A'));
      tracker.trackSkill(createMockSkill('skill_b', 'content B'));

      const versions = tracker.getAllVersions();
      expect(Object.keys(versions).length).toBe(2);
      expect(versions['skill_a']).toBeDefined();
      expect(versions['skill_b']).toBeDefined();
    });
  });

  describe('getCollectiveSignature', () => {
    it('应生成一致的集合签名', () => {
      tracker.trackSkill(createMockSkill('skill_a', 'content A'));
      tracker.trackSkill(createMockSkill('skill_b', 'content B'));

      const sig1 = tracker.getCollectiveSignature();
      const sig2 = tracker.getCollectiveSignature();

      expect(sig1).toBe(sig2);
      expect(sig1.length).toBe(16);
    });

    it('内容变化时集合签名应变化', () => {
      tracker.trackSkill(createMockSkill('skill_a', 'content A'));
      const sig1 = tracker.getCollectiveSignature();

      tracker.untrackSkill('skill_a');
      tracker.trackSkill(createMockSkill('skill_a', 'content A modified'));
      const sig2 = tracker.getCollectiveSignature();

      expect(sig1).not.toBe(sig2);
    });
  });

  describe('untrackSkill', () => {
    it('应停止追踪 Skill', () => {
      tracker.trackSkill(createMockSkill('test_skill', 'content'));
      expect(tracker.getVersionInfo('test_skill')).toBeDefined();

      tracker.untrackSkill('test_skill');
      expect(tracker.getVersionInfo('test_skill')).toBeUndefined();
    });
  });

  describe('getStats', () => {
    it('应返回正确的统计信息', () => {
      tracker.trackSkill(createMockSkill('skill1', 'content 1'));
      tracker.trackSkill(createMockSkill('skill2', 'content 2'));

      const stats = tracker.getStats();
      expect(stats.total).toBe(2);
      expect(stats.checkInterval).toBe(1000);
      expect(stats.autoCheckRunning).toBe(false);
    });
  });
});
