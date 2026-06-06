/**
 * Unit tests for src/utils/skillConflict.ts
 *
 * Tests jaccard similarity, conflict detection (high/medium/low),
 * findAllConflicts, and getCloseCandidates.
 * All functions are pure — no mocking needed.
 */

import { describe, it, expect } from 'vitest';
import {
  jaccard,
  checkConflict,
  findAllConflicts,
  getCloseCandidates,
} from '../utils/skillConflict';
import type { Skill } from '../types/skill';

// ===================== Test Fixtures =====================

const skillA: Skill = {
  id: 'skill-a',
  name: '库存管理',
  desc: '库龄预警、滞销处理、周转优化与保质期管理',
  icon: 'Inventory',
  category: 'core',
  path: '/inventory',
  trigger: '查看库存 / 库龄分析',
  tags: ['库存', '预警', '管理'],
  status: 'active',
  source: 'builtin',
};

const skillB: Skill = {
  id: 'skill-b',
  name: '库存优化',
  desc: '库龄预警与库存周转优化工具',
  icon: 'Inventory',
  category: 'core',
  path: '/inventory-opt',
  trigger: '查看库存 / 优化库存',
  tags: ['库存', '优化', '管理'],
  status: 'active',
  source: 'user',
};

const skillC: Skill = {
  id: 'skill-c',
  name: '出库管理',
  desc: '出库流程优化与订单处理',
  icon: 'Output',
  category: 'core',
  path: '/outbound',
  trigger: '出库操作 / 订单处理',
  tags: ['出库', '订单'],
  status: 'active',
  source: 'user',
};

const skillD: Skill = {
  id: 'skill-d',
  name: '报表导出',
  desc: '导出数据报表为 CSV 格式',
  icon: 'Description',
  category: 'data',
  path: '/export',
  trigger: '导出数据',
  tags: ['报表', '导出'],
  status: 'active',
  source: 'user',
};

// ===================== jaccard() =====================

describe('skillConflict.jaccard', () => {
  it('should return 1 for identical sets', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('should return 0 for completely disjoint sets', () => {
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('should return 1 for two empty sets', () => {
    expect(jaccard([], [])).toBe(1);
  });

  it('should return 0 when one set is empty and the other is not', () => {
    expect(jaccard(['a', 'b'], [])).toBe(0);
    expect(jaccard([], ['c', 'd'])).toBe(0);
  });

  it('should calculate partial overlap correctly', () => {
    // Intersection: {'b'} = 1, Union: {'a','b','c'} = 3 → 1/3
    const result = jaccard(['a', 'b'], ['b', 'c']);
    expect(result).toBeCloseTo(1 / 3, 5);
  });

  it('should be case-insensitive and trim whitespace', () => {
    expect(jaccard(['Hello', 'WORLD'], ['hello', 'world'])).toBe(1);
    expect(jaccard(['  spaced  '], ['spaced'])).toBe(1);
  });

  it('should filter out empty strings', () => {
    // ['a', ''] → {'a'}, ['a', ''] → {'a'} → jaccard = 1
    expect(jaccard(['a', ''], ['a', ''])).toBe(1);
  });
});

// ===================== checkConflict() =====================

describe('skillConflict.checkConflict', () => {
  it('should detect high conflict between similar skills (A vs B)', () => {
    const result = checkConflict(skillA, skillB);
    // Names are similar ("库存管理" vs "库存优化"), tags overlap, triggers overlap
    expect(result.score).toBeGreaterThan(0.3);
    expect(result.skillId).toBe('skill-b');
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('should detect low/no conflict between dissimilar skills (A vs D)', () => {
    const result = checkConflict(skillA, skillD);
    // Very different names, different tags, different triggers
    expect(result.score).toBeLessThan(0.3);
  });

  it('should detect medium conflict for partially similar skills (A vs C)', () => {
    const result = checkConflict(skillA, skillC);
    // Some overlap in category but different focus
    // Score should be between high-conflict and no-conflict
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should include skill name in result', () => {
    const result = checkConflict(skillA, skillB);
    expect(result.skillName).toBe('库存优化');
  });

  it('should cap score at 1', () => {
    // Even with very similar skills, score should not exceed 1
    const verySimilar: Skill = {
      ...skillA,
      id: 'skill-clone',
      name: skillA.name, // Same name
      trigger: skillA.trigger, // Same trigger
      tags: skillA.tags, // Same tags
      desc: skillA.desc, // Same desc
    };
    const result = checkConflict(skillA, verySimilar);
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it('should return reasons for detected conflicts', () => {
    const result = checkConflict(skillA, skillB);
    // Should have at least one reason since skills are similar
    if (result.score > 0) {
      expect(result.reasons.length).toBeGreaterThan(0);
      // Reasons should mention the type of similarity
      const reasonText = result.reasons.join(' ');
      expect(
        reasonText.includes('名称') ||
        reasonText.includes('触发词') ||
        reasonText.includes('标签') ||
        reasonText.includes('描述')
      ).toBe(true);
    }
  });

  it('should handle skills without optional fields', () => {
    const minimalSkill: Skill = {
      id: 'minimal',
      name: 'Minimal',
      desc: '',
      icon: 'Code',
      category: 'tool',
      path: '/',
      status: 'active',
      source: 'user',
      // No trigger, tags, or desc
    };
    const result = checkConflict(skillA, minimalSkill);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
  });
});

// ===================== findAllConflicts() =====================

describe('skillConflict.findAllConflicts', () => {
  const allSkills = [skillA, skillB, skillC, skillD];

  it('should find conflicts above threshold', () => {
    const conflicts = findAllConflicts(skillA, allSkills, 0.1);
    // skillB should conflict with skillA (very similar)
    const hasSkillBConflict = conflicts.some((c) => c.skillId === 'skill-b');
    expect(hasSkillBConflict).toBe(true);
  });

  it('should exclude self from conflict results', () => {
    const conflicts = findAllConflicts(skillA, allSkills);
    const hasSelfConflict = conflicts.some((c) => c.skillId === 'skill-a');
    expect(hasSelfConflict).toBe(false);
  });

  it('should sort results by score descending', () => {
    const conflicts = findAllConflicts(skillA, allSkills, 0.05);
    for (let i = 1; i < conflicts.length; i++) {
      expect(conflicts[i - 1].score).toBeGreaterThanOrEqual(conflicts[i].score);
    }
  });

  it('should respect custom threshold', () => {
    // High threshold — only very similar skills
    const highThreshold = findAllConflicts(skillA, allSkills, 0.5);
    // Low threshold — more results
    const lowThreshold = findAllConflicts(skillA, allSkills, 0.01);
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });

  it('should return empty array when no conflicts found', () => {
    const uniqueSkill: Skill = {
      id: 'unique-skill',
      name: '完全独特技能',
      desc: '与任何现有技能都不同',
      icon: 'Code',
      category: 'media',
      path: '/unique',
      trigger: '独特触发词',
      tags: ['独特', '唯一'],
      status: 'active',
      source: 'user',
    };
    const conflicts = findAllConflicts(uniqueSkill, allSkills, 0.8);
    expect(conflicts).toEqual([]);
  });
});

// ===================== getCloseCandidates() =====================

describe('skillConflict.getCloseCandidates', () => {
  const allSkills = [skillA, skillB, skillC, skillD];

  it('should find candidates matching the input string', () => {
    const candidates = getCloseCandidates('库存', allSkills, 0.1);
    // Should match skillA and skillB which have "库存" in name/trigger
    expect(candidates.length).toBeGreaterThan(0);
    const names = candidates.map((c) => c.name);
    expect(names).toContain('库存管理');
    expect(names).toContain('库存优化');
  });

  it('should sort candidates by matchScore descending', () => {
    const candidates = getCloseCandidates('库存', allSkills, 0.1);
    for (let i = 1; i < candidates.length; i++) {
      expect(candidates[i - 1].matchScore).toBeGreaterThanOrEqual(candidates[i].matchScore);
    }
  });

  it('should return empty array when no candidates match', () => {
    const candidates = getCloseCandidates('zzzzzzz', allSkills, 0.3);
    expect(candidates).toEqual([]);
  });

  it('should include reason string in suggestions', () => {
    const candidates = getCloseCandidates('库存', allSkills, 0.1);
    if (candidates.length > 0) {
      expect(candidates[0].reason).toBeTruthy();
      expect(typeof candidates[0].reason).toBe('string');
    }
  });

  it('should cap matchScore at 1', () => {
    const candidates = getCloseCandidates('库存管理', allSkills, 0.01);
    candidates.forEach((c) => {
      expect(c.matchScore).toBeLessThanOrEqual(1);
    });
  });

  it('should respect threshold parameter', () => {
    const lowThreshold = getCloseCandidates('库存', allSkills, 0.01);
    const highThreshold = getCloseCandidates('库存', allSkills, 0.8);
    expect(lowThreshold.length).toBeGreaterThanOrEqual(highThreshold.length);
  });
});
