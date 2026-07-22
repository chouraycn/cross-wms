import { describe, it, expect, beforeEach } from 'vitest';
import {
  SkillVersionRegistry,
  parseVersion,
  formatVersion,
  compareVersions,
  registerSkillWithVersion,
  setDefaultAliases,
  type SkillEntry,
  type VersionedSkillEntry,
} from '../skill-version-registry.js';

function makeSkillEntry(name: string, description = 'test'): SkillEntry {
  return {
    skill: {
      name,
      description,
      filePath: `/tmp/${name}/SKILL.md`,
      baseDir: `/tmp/${name}`,
      source: 'bundled',
      disableModelInvocation: false,
    },
    frontmatter: {},
  };
}

describe('parseVersion', () => {
  it('应解析标准 SemVer', () => {
    const r = parseVersion('1.2.3');
    expect(r.success).toBe(true);
    expect(r.version).toEqual({ major: 1, minor: 2, patch: 3, prerelease: undefined });
  });

  it('应解析带 v 前缀的版本', () => {
    const r = parseVersion('v2.0.0');
    expect(r.success).toBe(true);
    expect(r.version?.major).toBe(2);
  });

  it('应解析大写 V 前缀', () => {
    const r = parseVersion('V1.0.0');
    expect(r.success).toBe(true);
  });

  it('应解析 prerelease 版本', () => {
    const r = parseVersion('1.0.0-alpha.1');
    expect(r.success).toBe(true);
    expect(r.version?.prerelease).toBe('alpha.1');
  });

  it('应忽略 build metadata', () => {
    const r = parseVersion('1.0.0+build.123');
    expect(r.success).toBe(true);
    expect(r.version?.major).toBe(1);
    expect(r.version?.prerelease).toBeUndefined();
  });

  it('应同时支持 prerelease 和 build metadata', () => {
    const r = parseVersion('1.0.0-beta.2+build.456');
    expect(r.success).toBe(true);
    expect(r.version?.prerelease).toBe('beta.2');
  });

  it('空字符串应失败', () => {
    expect(parseVersion('').success).toBe(false);
  });

  it('格式错误应失败', () => {
    expect(parseVersion('1.2').success).toBe(false);
    expect(parseVersion('1.2.3.4').success).toBe(false);
    expect(parseVersion('a.b.c').success).toBe(false);
  });

  it('负数应失败', () => {
    expect(parseVersion('1.-2.3').success).toBe(false);
  });

  it('非字符串应失败', () => {
    expect(parseVersion(undefined as unknown as string).success).toBe(false);
  });
});

describe('formatVersion', () => {
  it('应格式化标准版本', () => {
    expect(formatVersion({ major: 1, minor: 2, patch: 3 })).toBe('1.2.3');
  });

  it('应格式化带 prerelease 的版本', () => {
    expect(formatVersion({ major: 1, minor: 0, patch: 0, prerelease: 'alpha.1' })).toBe('1.0.0-alpha.1');
  });
});

describe('compareVersions', () => {
  it('主版本号决定顺序', () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 2, minor: 0, patch: 0 })).toBe(-1);
    expect(compareVersions({ major: 2, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(1);
  });

  it('次版本号决定顺序（主版本相同）', () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 1, patch: 0 })).toBe(-1);
  });

  it('修订号决定顺序', () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 1 })).toBe(-1);
  });

  it('相等版本应返回 0', () => {
    expect(compareVersions({ major: 1, minor: 0, patch: 0 }, { major: 1, minor: 0, patch: 0 })).toBe(0);
  });

  it('prerelease 版本低于正式版本', () => {
    expect(
      compareVersions(
        { major: 1, minor: 0, patch: 0, prerelease: 'alpha.1' },
        { major: 1, minor: 0, patch: 0 },
      ),
    ).toBe(-1);
  });

  it('两个 prerelease 版本应按字母序比较', () => {
    expect(
      compareVersions(
        { major: 1, minor: 0, patch: 0, prerelease: 'alpha' },
        { major: 1, minor: 0, patch: 0, prerelease: 'beta' },
      ),
    ).toBe(-1);
  });
});

describe('SkillVersionRegistry', () => {
  let registry: SkillVersionRegistry;

  beforeEach(() => {
    registry = new SkillVersionRegistry();
  });

  describe('register / unregister', () => {
    it('应注册技能版本', () => {
      const r = registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      expect(r.success).toBe(true);
      expect(registry.getVersion('skill-a', '1.0.0')).toBeDefined();
    });

    it('重复注册相同版本应失败', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      const r = registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      expect(r.success).toBe(false);
      expect(r.error).toContain('already registered');
    });

    it('相同技能可注册多个版本', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '1.1.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '2.0.0', makeSkillEntry('skill-a'));
      expect(registry.listVersions('skill-a').length).toBe(3);
    });

    it('无效版本号应失败', () => {
      const r = registry.register('skill-a', 'invalid', makeSkillEntry('skill-a'));
      expect(r.success).toBe(false);
    });

    it('unregister 应移除版本', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      expect(registry.unregister('skill-a', '1.0.0')).toBe(true);
      expect(registry.getVersion('skill-a', '1.0.0')).toBeUndefined();
    });

    it('unregister 不存在的版本应返回 false', () => {
      expect(registry.unregister('skill-a', '1.0.0')).toBe(false);
    });
  });

  describe('listVersions / getLatest', () => {
    beforeEach(() => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '1.1.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '2.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '1.0.0-alpha.1', makeSkillEntry('skill-a'));
    });

    it('listVersions 应按版本升序排列', () => {
      const list = registry.listVersions('skill-a');
      expect(list.length).toBe(4);
      // 1.0.0-alpha.1 < 1.0.0 < 1.1.0 < 2.0.0
      expect(list[0].versionString).toBe('1.0.0-alpha.1');
      expect(list[3].versionString).toBe('2.0.0');
    });

    it('getLatest 应返回最高版本', () => {
      const latest = registry.getLatest('skill-a');
      expect(latest?.versionString).toBe('2.0.0');
    });

    it('getLatest 应优先返回非预发布版本', () => {
      // 全部预发布版本的场景
      registry.register('skill-b', '1.0.0-beta.1', makeSkillEntry('skill-b'));
      registry.register('skill-b', '1.0.0-alpha.1', makeSkillEntry('skill-b'));
      const latest = registry.getLatest('skill-b');
      expect(latest?.versionString).toBe('1.0.0-beta.1');
    });

    it('getLatestStable 应仅返回正式版本', () => {
      registry.register('skill-c', '1.0.0-alpha.1', makeSkillEntry('skill-c'));
      registry.register('skill-c', '1.0.0', makeSkillEntry('skill-c'));
      registry.register('skill-c', '1.1.0', makeSkillEntry('skill-c'));

      const stable = registry.getLatestStable('skill-c');
      expect(stable?.versionString).toBe('1.1.0');
    });

    it('未注册的技能应返回 undefined', () => {
      expect(registry.getLatest('nonexistent')).toBeUndefined();
      expect(registry.listVersions('nonexistent')).toEqual([]);
    });
  });

  describe('别名管理', () => {
    beforeEach(() => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '2.0.0', makeSkillEntry('skill-a'));
    });

    it('setAlias 应创建别名', () => {
      const r = registry.setAlias('skill-a', 'latest', '2.0.0');
      expect(r.success).toBe(true);

      const resolved = registry.resolveByAlias('skill-a', 'latest');
      expect(resolved?.versionString).toBe('2.0.0');
    });

    it('setAlias 不存在的版本应失败', () => {
      const r = registry.setAlias('skill-a', 'latest', '9.9.9');
      expect(r.success).toBe(false);
    });

    it('setAlias 应允许覆盖已有别名', () => {
      registry.setAlias('skill-a', 'latest', '1.0.0');
      expect(registry.resolveByAlias('skill-a', 'latest')?.versionString).toBe('1.0.0');

      registry.setAlias('skill-a', 'latest', '2.0.0');
      expect(registry.resolveByAlias('skill-a', 'latest')?.versionString).toBe('2.0.0');
    });

    it('removeAlias 应移除别名', () => {
      registry.setAlias('skill-a', 'latest', '2.0.0');
      expect(registry.removeAlias('skill-a', 'latest')).toBe(true);
      expect(registry.resolveByAlias('skill-a', 'latest')).toBeUndefined();
    });

    it('removeAlias 不存在的别名应返回 false', () => {
      expect(registry.removeAlias('skill-a', 'nonexistent')).toBe(false);
    });

    it('getAliases 应返回所有别名', () => {
      registry.setAlias('skill-a', 'latest', '2.0.0');
      registry.setAlias('skill-a', 'stable', '1.0.0');
      const aliases = registry.getAliases('skill-a');
      expect(aliases.length).toBe(2);
      const aliasNames = aliases.map((a) => a.alias).sort();
      expect(aliasNames).toEqual(['latest', 'stable']);
    });

    it('resolveByAlias 不存在的别名应返回 undefined', () => {
      expect(registry.resolveByAlias('skill-a', 'nonexistent')).toBeUndefined();
    });
  });

  describe('状态管理', () => {
    it('新注册版本应为 active', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      expect(registry.getVersion('skill-a', '1.0.0')?.status).toBe('active');
    });

    it('setStatus 应更新状态', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      expect(registry.setStatus('skill-a', '1.0.0', 'deprecated')).toBe(true);
      expect(registry.getVersion('skill-a', '1.0.0')?.status).toBe('deprecated');
    });

    it('setStatus 不存在的版本应返回 false', () => {
      expect(registry.setStatus('skill-a', '1.0.0', 'yanked')).toBe(false);
    });
  });

  describe('版本兼容性检查', () => {
    beforeEach(() => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '1.1.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '2.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '3.0.0', makeSkillEntry('skill-a'));
    });

    it('compatibleMajors 应限制主版本号', () => {
      expect(registry.isCompatible('skill-a', '1.0.0', { compatibleMajors: [1] })).toBe(true);
      expect(registry.isCompatible('skill-a', '2.0.0', { compatibleMajors: [1] })).toBe(false);
    });

    it('min 应限制最低版本', () => {
      const min = { major: 1, minor: 1, patch: 0 };
      expect(registry.isCompatible('skill-a', '1.0.0', { min })).toBe(false);
      expect(registry.isCompatible('skill-a', '1.1.0', { min })).toBe(true);
      expect(registry.isCompatible('skill-a', '2.0.0', { min })).toBe(true);
    });

    it('max 应限制最高版本（不含）', () => {
      const max = { major: 2, minor: 0, patch: 0 };
      expect(registry.isCompatible('skill-a', '1.1.0', { max })).toBe(true);
      expect(registry.isCompatible('skill-a', '2.0.0', { max })).toBe(false);
    });

    it('findInrange 应返回范围内的版本', () => {
      const results = registry.findInrange('skill-a', {
        min: { major: 1, minor: 1, patch: 0 },
        max: { major: 3, minor: 0, patch: 0 },
      });
      expect(results.length).toBe(2);
      expect(results.map((r) => r.versionString).sort()).toEqual(['1.1.0', '2.0.0']);
    });

    it('不存在的技能应返回 false', () => {
      expect(registry.isCompatible('nonexistent', '1.0.0', {})).toBe(false);
    });
  });

  describe('getStats / getRegisteredNames', () => {
    it('应返回全局统计', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-a', '2.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-b', '1.0.0', makeSkillEntry('skill-b'));
      registry.setStatus('skill-a', '1.0.0', 'deprecated');
      registry.setAlias('skill-a', 'latest', '2.0.0');

      const stats = registry.getStats();
      expect(stats.totalSkills).toBe(2);
      expect(stats.totalVersions).toBe(3);
      expect(stats.activeVersions).toBe(2);
      expect(stats.deprecatedVersions).toBe(1);
      expect(stats.totalAliases).toBe(1);
    });

    it('getRegisteredNames 应返回所有技能名', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.register('skill-b', '1.0.0', makeSkillEntry('skill-b'));
      expect(registry.getRegisteredNames().sort()).toEqual(['skill-a', 'skill-b']);
    });

    it('空 registry 应返回零统计', () => {
      const stats = registry.getStats();
      expect(stats.totalSkills).toBe(0);
      expect(stats.totalVersions).toBe(0);
    });
  });

  describe('clear', () => {
    it('应清空所有数据', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      registry.setAlias('skill-a', 'latest', '1.0.0');
      registry.clear();
      expect(registry.getStats().totalSkills).toBe(0);
      expect(registry.getAliases('skill-a')).toHaveLength(0);
    });
  });

  describe('便利函数', () => {
    it('registerSkillWithVersion 应能注册', () => {
      const entry = makeSkillEntry('my-skill');
      const r = registerSkillWithVersion(registry, entry, '1.0.0');
      expect(r.success).toBe(true);
      expect(registry.getVersion('my-skill', '1.0.0')).toBeDefined();
    });

    it('setDefaultAliases 应设置别名', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      const r = setDefaultAliases(registry, 'skill-a', '1.0.0', 'stable');
      expect(r.success).toBe(true);
      expect(registry.resolveByAlias('skill-a', 'stable')?.versionString).toBe('1.0.0');
    });
  });

  describe('完整生命周期', () => {
    it('注册、查询、设置别名、状态变更、注销的完整流程', () => {
      // 注册多个版本
      expect(registry.register('wms-core', '1.0.0', makeSkillEntry('wms-core')).success).toBe(true);
      expect(registry.register('wms-core', '1.1.0', makeSkillEntry('wms-core')).success).toBe(true);
      expect(registry.register('wms-core', '2.0.0', makeSkillEntry('wms-core')).success).toBe(true);

      // 设置别名
      registry.setAlias('wms-core', 'latest', '2.0.0');
      registry.setAlias('wms-core', 'stable', '1.1.0');
      registry.setAlias('wms-core', 'experimental', '2.0.0');

      // 通过别名查询
      const latest = registry.resolveByAlias('wms-core', 'latest');
      const stable = registry.resolveByAlias('wms-core', 'stable');
      expect(latest?.versionString).toBe('2.0.0');
      expect(stable?.versionString).toBe('1.1.0');

      // 标记旧版本为 deprecated
      registry.setStatus('wms-core', '1.0.0', 'deprecated');
      // getLatestStable 返回最新的 active 非预发布版本，仍为 2.0.0
      expect(registry.getLatestStable('wms-core')?.versionString).toBe('2.0.0');
      // 1.0.0 已被标记为 deprecated
      expect(registry.getVersion('wms-core', '1.0.0')?.status).toBe('deprecated');

      // 兼容性查询
      const compatible = registry.findInrange('wms-core', { compatibleMajors: [1] });
      expect(compatible.length).toBe(2);

      // 注销某个版本
      registry.unregister('wms-core', '1.0.0');
      expect(registry.getVersion('wms-core', '1.0.0')).toBeUndefined();

      // 最终统计
      const stats = registry.getStats();
      expect(stats.totalVersions).toBe(2);
      expect(stats.totalAliases).toBe(3);
    });
  });

  describe('类型安全', () => {
    it('VersionedSkillEntry 应包含所有必需字段', () => {
      registry.register('skill-a', '1.0.0', makeSkillEntry('skill-a'));
      const entry: VersionedSkillEntry | undefined = registry.getVersion('skill-a', '1.0.0');
      expect(entry).toBeDefined();
      if (entry) {
        expect(typeof entry.name).toBe('string');
        expect(typeof entry.versionString).toBe('string');
        expect(typeof entry.registeredAt).toBe('number');
        expect(['active', 'deprecated', 'yanked']).toContain(entry.status);
        expect(entry.entry).toBeDefined();
      }
    });
  });
});
