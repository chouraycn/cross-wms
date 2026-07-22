import { describe, it, expect } from 'vitest';
import {
  preInstallCheck,
  postLoadCheck,
  canLoadSkill,
  skillDependencyChecker,
} from '../skill-dependency-checker.js';
import type { SkillEntry } from '../types.js';

function makeEntry(
  name: string,
  dependencies?: Array<{ skill: string; required?: boolean; reason?: string }>,
  conflicts?: Array<{ skill: string; reason: string }>,
): SkillEntry {
  const frontmatter: Record<string, string> = {};
  if (dependencies) {
    frontmatter.dependencies = JSON.stringify(dependencies);
  }
  if (conflicts) {
    frontmatter.conflicts = JSON.stringify(conflicts);
  }
  return {
    skill: {
      name,
      description: `${name} description`,
      filePath: `/skills/${name}/SKILL.md`,
      baseDir: `/skills/${name}`,
      source: 'bundled',
      disableModelInvocation: false,
    },
    frontmatter,
  };
}

describe('skill-dependency-checker', () => {
  describe('preInstallCheck', () => {
    it('无依赖且无冲突时应通过', () => {
      const newEntry = makeEntry('new-skill');
      const result = preInstallCheck(newEntry, []);
      expect(result.allowed).toBe(true);
      expect(result.result.valid).toBe(true);
      expect(result.report).toContain('new-skill');
    });

    it('已存在技能且未启用 allowOverride 应拒绝', () => {
      const newEntry = makeEntry('existing-skill');
      const existing = [makeEntry('existing-skill')];
      const result = preInstallCheck(newEntry, existing);
      expect(result.allowed).toBe(false);
      expect(result.report).toContain('已存在');
      expect(result.report).toContain('allowOverride');
    });

    it('已存在技能但启用 allowOverride 时应通过', () => {
      const newEntry = makeEntry('existing-skill');
      const existing = [makeEntry('existing-skill')];
      const result = preInstallCheck(newEntry, existing, { allowOverride: true });
      expect(result.allowed).toBe(true);
    });

    it('缺失必需依赖时应拒绝', () => {
      const newEntry = makeEntry('new-skill', [{ skill: 'missing-dep', required: true }]);
      const result = preInstallCheck(newEntry, []);
      expect(result.allowed).toBe(false);
      expect(result.result.missing.length).toBeGreaterThan(0);
      expect(result.result.missing[0].skill).toBe('missing-dep');
    });

    it('缺失可选依赖时不应拒绝', () => {
      const newEntry = makeEntry('new-skill', [{ skill: 'optional-dep', required: false }]);
      const result = preInstallCheck(newEntry, []);
      expect(result.allowed).toBe(true);
      expect(result.result.optionalMissing.length).toBeGreaterThan(0);
    });

    it('依赖已存在时应通过', () => {
      const newEntry = makeEntry('new-skill', [{ skill: 'dep-skill', required: true }]);
      const existing = [makeEntry('dep-skill')];
      const result = preInstallCheck(newEntry, existing);
      expect(result.allowed).toBe(true);
      expect(result.result.missing).toHaveLength(0);
    });

    it('冲突技能已存在时应拒绝', () => {
      const newEntry = makeEntry(
        'new-skill',
        undefined,
        [{ skill: 'conflicting-skill', reason: '功能重复' }],
      );
      const existing = [makeEntry('conflicting-skill')];
      const result = preInstallCheck(newEntry, existing);
      expect(result.allowed).toBe(false);
      expect(result.result.conflicts.length).toBeGreaterThan(0);
    });

    it('禁用 checkConflicts 时冲突不应阻止安装', () => {
      const newEntry = makeEntry(
        'new-skill',
        undefined,
        [{ skill: 'conflicting-skill', reason: '功能重复' }],
      );
      const existing = [makeEntry('conflicting-skill')];
      const result = preInstallCheck(newEntry, existing, { checkConflicts: false });
      expect(result.allowed).toBe(true);
      expect(result.result.conflicts).toHaveLength(0);
    });

    it('禁用 blockOnFailure 时即使有问题也允许', () => {
      const newEntry = makeEntry('new-skill', [{ skill: 'missing-dep', required: true }]);
      const result = preInstallCheck(newEntry, [], { blockOnFailure: false });
      expect(result.allowed).toBe(true);
      expect(result.result.valid).toBe(false);
    });
  });

  describe('postLoadCheck', () => {
    it('应返回批量检查结果', () => {
      const entries = [
        makeEntry('skill-a'),
        makeEntry('skill-b', [{ skill: 'skill-a', required: true }]),
      ];
      const result = postLoadCheck(entries);
      expect(result.total).toBe(2);
      expect(result.passed).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.results.size).toBe(2);
      expect(result.loadOrder.length).toBe(2);
    });

    it('应检测到失败技能', () => {
      const entries = [
        makeEntry('skill-a', [{ skill: 'missing-dep', required: true }]),
      ];
      const result = postLoadCheck(entries);
      expect(result.failed).toBe(1);
      expect(result.passed).toBe(0);
      const failedResult = result.results.get('skill-a');
      expect(failedResult?.allowed).toBe(false);
    });

    it('应识别拓扑排序后的加载顺序', () => {
      const entries = [
        makeEntry('dependent', [{ skill: 'base', required: true }]),
        makeEntry('base'),
      ];
      const result = postLoadCheck(entries);
      // base 应在 dependent 之前（深度更小）
      const baseIdx = result.loadOrder.findIndex((e) => e.skill.name === 'base');
      const dependentIdx = result.loadOrder.findIndex((e) => e.skill.name === 'dependent');
      expect(baseIdx).toBeLessThan(dependentIdx);
    });

    it('应包含汇总报告', () => {
      const entries = [makeEntry('skill-a')];
      const result = postLoadCheck(entries);
      expect(result.report).toContain('技能依赖批量检查报告');
      expect(result.report).toContain('总数: 1');
      expect(result.report).toContain('通过: 1');
    });
  });

  describe('canLoadSkill', () => {
    it('无循环依赖时应允许加载', () => {
      const entry = makeEntry('new-skill');
      const all = [makeEntry('existing')];
      const result = canLoadSkill(entry, all);
      expect(result.canLoad).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('形成循环依赖时应拒绝', () => {
      // a 依赖 b，b 依赖 a 形成循环
      const a = makeEntry('a', [{ skill: 'b', required: true }]);
      const b = makeEntry('b', [{ skill: 'a', required: true }]);
      const result = canLoadSkill(a, [b]);
      expect(result.canLoad).toBe(false);
      expect(result.reason).toContain('Cyclic dependency');
    });
  });

  describe('skillDependencyChecker 单例', () => {
    it('应暴露 preInstallCheck / postLoadCheck / canLoadSkill', () => {
      expect(typeof skillDependencyChecker.preInstallCheck).toBe('function');
      expect(typeof skillDependencyChecker.postLoadCheck).toBe('function');
      expect(typeof skillDependencyChecker.canLoadSkill).toBe('function');
    });

    it('单例调用应与导出函数行为一致', () => {
      const entry = makeEntry('solo');
      const result = skillDependencyChecker.preInstallCheck(entry, []);
      expect(result.allowed).toBe(true);
    });
  });
});
