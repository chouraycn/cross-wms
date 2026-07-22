import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  recordMutation,
  getMutationHistory,
  getRecentMutations,
  applyConfigChange,
  rollbackToMutation,
  rollbackLastMutation,
  getCurrentConfig,
  compareConfigs,
  clearMutationHistory,
  saveMutationHistory,
  loadMutationHistory,
  deepDiff,
  applyPatch,
  reversePatch,
} from '../config/index.js';
import type { SkillConfigMutation } from '../config/index.js';

describe('config-mutations', () => {
  beforeEach(() => {
    clearMutationHistory();
  });

  afterEach(() => {
    clearMutationHistory();
  });

  describe('recordMutation', () => {
    it('应正确记录变更', () => {
      const mutation = recordMutation('test-skill', {
        type: 'create',
        field: 'enabled',
        newValue: true,
        author: 'test-user',
        reason: 'initial setup',
      });

      expect(mutation.id).toBeDefined();
      expect(mutation.timestamp).toBeGreaterThan(0);
      expect(mutation.skillName).toBe('test-skill');
      expect(mutation.type).toBe('create');
      expect(mutation.field).toBe('enabled');
      expect(mutation.newValue).toBe(true);
      expect(mutation.author).toBe('test-user');
      expect(mutation.reason).toBe('initial setup');
    });

    it('应为同一技能累积多条变更', () => {
      recordMutation('test-skill', { type: 'create', field: 'a', newValue: 1 });
      recordMutation('test-skill', { type: 'update', field: 'a', oldValue: 1, newValue: 2 });

      const history = getMutationHistory('test-skill');
      expect(history.mutations).toHaveLength(2);
    });

    it('应为不同技能维护独立历史', () => {
      recordMutation('skill-a', { type: 'create', field: 'x', newValue: 1 });
      recordMutation('skill-b', { type: 'create', field: 'y', newValue: 2 });

      expect(getMutationHistory('skill-a').mutations).toHaveLength(1);
      expect(getMutationHistory('skill-b').mutations).toHaveLength(1);
    });
  });

  describe('getMutationHistory', () => {
    it('无历史时应返回空数组', () => {
      const history = getMutationHistory('nonexistent');
      expect(history.skillName).toBe('nonexistent');
      expect(history.mutations).toEqual([]);
    });

    it('应返回变更的副本', () => {
      recordMutation('test-skill', { type: 'create', field: 'x', newValue: 1 });
      const history1 = getMutationHistory('test-skill');
      const history2 = getMutationHistory('test-skill');

      expect(history1.mutations).not.toBe(history2.mutations);
      expect(history1.mutations[0]).not.toBe(history2.mutations[0]);
    });
  });

  describe('getRecentMutations', () => {
    it('应按时间倒序返回最近的变更', () => {
      const skillNames = ['skill-a', 'skill-b', 'skill-c'];
      for (let i = 0; i < 10; i++) {
        const skill = skillNames[i % 3];
        recordMutation(skill, { type: 'update', field: `field-${i}`, newValue: i });
      }

      const recent = getRecentMutations(5);
      expect(recent).toHaveLength(5);

      for (let i = 1; i < recent.length; i++) {
        expect(recent[i - 1].timestamp).toBeGreaterThanOrEqual(recent[i].timestamp);
      }
    });

    it('默认限制数量应默认为 50', () => {
      for (let i = 0; i < 60; i++) {
        recordMutation('test-skill', { type: 'update', field: `f${i}`, newValue: i });
      }

      const recent = getRecentMutations();
      expect(recent).toHaveLength(50);
    });
  });

  describe('applyConfigChange', () => {
    it('应创建新字段', () => {
      const result = applyConfigChange('test-skill', 'enabled', true);
      expect(result.success).toBe(true);
      expect(result.mutation?.type).toBe('create');
      expect(result.previousValue).toBeUndefined();

      const config = getCurrentConfig('test-skill');
      expect(config.enabled).toBe(true);
    });

    it('应更新已有字段', () => {
      applyConfigChange('test-skill', 'count', 1);
      const result = applyConfigChange('test-skill', 'count', 2);

      expect(result.success).toBe(true);
      expect(result.mutation?.type).toBe('update');
      expect(result.previousValue).toBe(1);

      const config = getCurrentConfig('test-skill');
      expect(config.count).toBe(2);
    });

    it('应删除字段', () => {
      applyConfigChange('test-skill', 'temp', 'value');
      const result = applyConfigChange('test-skill', 'temp', undefined);

      expect(result.success).toBe(true);
      expect(result.mutation?.type).toBe('delete');
      expect(result.previousValue).toBe('value');

      const config = getCurrentConfig('test-skill');
      expect(config.temp).toBeUndefined();
    });

    it('值未变化时不应创建变更', () => {
      applyConfigChange('test-skill', 'same', 42);
      const result = applyConfigChange('test-skill', 'same', 42);

      expect(result.success).toBe(false);
      expect(result.mutation).toBeUndefined();

      const history = getMutationHistory('test-skill');
      expect(history.mutations).toHaveLength(1);
    });

    it('dryRun 模式不应实际修改配置', () => {
      const result = applyConfigChange('test-skill', 'dry', 'value', { dryRun: true });

      expect(result.success).toBe(true);

      const config = getCurrentConfig('test-skill');
      expect(config.dry).toBeUndefined();

      const history = getMutationHistory('test-skill');
      expect(history.mutations).toHaveLength(0);
    });

    it('应记录 author 和 reason', () => {
      const result = applyConfigChange('test-skill', 'authored', true, {
        author: 'alice',
        reason: '测试原因',
      });

      expect(result.mutation?.author).toBe('alice');
      expect(result.mutation?.reason).toBe('测试原因');
    });
  });

  describe('rollbackToMutation', () => {
    it('应回滚到指定变更', () => {
      applyConfigChange('test-skill', 'a', 1);
      const m2 = applyConfigChange('test-skill', 'b', 2);
      applyConfigChange('test-skill', 'c', 3);

      const result = rollbackToMutation('test-skill', m2.mutation!.id);
      expect(result.success).toBe(true);
      expect(result.rolledBackCount).toBe(2);

      const config = getCurrentConfig('test-skill');
      expect(config.a).toBe(1);
      expect(config.b).toBeUndefined();
      expect(config.c).toBeUndefined();
    });

    it('找不到变更时应返回失败', () => {
      const result = rollbackToMutation('test-skill', 'nonexistent-id');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('无历史记录时应返回失败', () => {
      const result = rollbackToMutation('no-history', 'some-id');
      expect(result.success).toBe(false);
    });
  });

  describe('rollbackLastMutation', () => {
    it('应回滚最后一个变更', () => {
      applyConfigChange('test-skill', 'a', 1);
      applyConfigChange('test-skill', 'b', 2);

      const result = rollbackLastMutation('test-skill');
      expect(result.success).toBe(true);
      expect(result.rolledBackCount).toBe(1);

      const config = getCurrentConfig('test-skill');
      expect(config.a).toBe(1);
      expect(config.b).toBeUndefined();
    });

    it('应回滚最后 N 个变更', () => {
      applyConfigChange('test-skill', 'a', 1);
      applyConfigChange('test-skill', 'b', 2);
      applyConfigChange('test-skill', 'c', 3);

      const result = rollbackLastMutation('test-skill', 2);
      expect(result.success).toBe(true);
      expect(result.rolledBackCount).toBe(2);

      const config = getCurrentConfig('test-skill');
      expect(config.a).toBe(1);
      expect(config.b).toBeUndefined();
      expect(config.c).toBeUndefined();
    });

    it('N 超过实际数量时应回滚全部', () => {
      applyConfigChange('test-skill', 'a', 1);

      const result = rollbackLastMutation('test-skill', 100);
      expect(result.success).toBe(true);
      expect(result.rolledBackCount).toBe(1);

      const config = getCurrentConfig('test-skill');
      expect(config.a).toBeUndefined();
    });
  });

  describe('getCurrentConfig', () => {
    it('无配置时应返回空对象', () => {
      const config = getCurrentConfig('nonexistent');
      expect(config).toEqual({});
    });

    it('应返回配置的副本', () => {
      applyConfigChange('test-skill', 'x', 1);
      const config1 = getCurrentConfig('test-skill');
      const config2 = getCurrentConfig('test-skill');

      expect(config1).not.toBe(config2);
    });
  });

  describe('compareConfigs', () => {
    it('应比较两个配置的差异', () => {
      const before = { a: 1, b: 2, c: 3 };
      const after = { a: 1, b: 4, d: 5 };

      const diffs = compareConfigs(before, after);
      const diffPaths = diffs.map((d) => d.path);

      expect(diffPaths).toContain('b');
      expect(diffPaths).toContain('c');
      expect(diffPaths).toContain('d');
    });

    it('相同配置应返回空差异', () => {
      const config = { x: 1, y: 2 };
      const diffs = compareConfigs(config, { ...config });
      expect(diffs).toHaveLength(0);
    });
  });

  describe('clearMutationHistory', () => {
    it('应清除指定技能的历史', () => {
      applyConfigChange('skill-a', 'x', 1);
      applyConfigChange('skill-b', 'y', 2);

      clearMutationHistory('skill-a');

      expect(getMutationHistory('skill-a').mutations).toHaveLength(0);
      expect(getMutationHistory('skill-b').mutations).toHaveLength(1);
    });

    it('不传参数应清除所有历史', () => {
      applyConfigChange('skill-a', 'x', 1);
      applyConfigChange('skill-b', 'y', 2);

      clearMutationHistory();

      expect(getMutationHistory('skill-a').mutations).toHaveLength(0);
      expect(getMutationHistory('skill-b').mutations).toHaveLength(0);
    });
  });

  describe('saveMutationHistory / loadMutationHistory', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-mutations-test-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('应保存和加载变更历史', () => {
      applyConfigChange('test-skill', 'a', 1, { author: 'tester', reason: 'test' });
      applyConfigChange('test-skill', 'b', 2);

      const filePath = path.join(tempDir, 'history.json');
      const saved = saveMutationHistory('test-skill', filePath);
      expect(saved).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);

      clearMutationHistory('test-skill');
      expect(getCurrentConfig('test-skill')).toEqual({});

      const loaded = loadMutationHistory('test-skill', filePath);
      expect(loaded).toBe(true);

      const config = getCurrentConfig('test-skill');
      expect(config.a).toBe(1);
      expect(config.b).toBe(2);

      const history = getMutationHistory('test-skill');
      expect(history.mutations).toHaveLength(2);
    });

    it('文件不存在时加载应返回 false', () => {
      const result = loadMutationHistory('test-skill', '/nonexistent/path.json');
      expect(result).toBe(false);
    });

    it('应自动创建目录', () => {
      applyConfigChange('test-skill', 'x', 1);
      const filePath = path.join(tempDir, 'sub', 'dir', 'history.json');

      const saved = saveMutationHistory('test-skill', filePath);
      expect(saved).toBe(true);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('deepDiff', () => {
    it('相同对象应返回空差异', () => {
      const obj = { a: 1, b: { c: 2 } };
      const diffs = deepDiff(obj, { ...obj });
      expect(diffs).toHaveLength(0);
    });

    it('应检测新增字段', () => {
      const diffs = deepDiff({ a: 1 }, { a: 1, b: 2 });
      expect(diffs).toHaveLength(1);
      expect(diffs[0].op).toBe('add');
      expect(diffs[0].path).toBe('b');
      expect(diffs[0].newValue).toBe(2);
    });

    it('应检测删除字段', () => {
      const diffs = deepDiff({ a: 1, b: 2 }, { a: 1 });
      expect(diffs).toHaveLength(1);
      expect(diffs[0].op).toBe('remove');
      expect(diffs[0].path).toBe('b');
      expect(diffs[0].oldValue).toBe(2);
    });

    it('应检测修改字段', () => {
      const diffs = deepDiff({ a: 1 }, { a: 2 });
      expect(diffs).toHaveLength(1);
      expect(diffs[0].op).toBe('replace');
      expect(diffs[0].path).toBe('a');
      expect(diffs[0].oldValue).toBe(1);
      expect(diffs[0].newValue).toBe(2);
    });

    it('应深度比较嵌套对象', () => {
      const diffs = deepDiff({ a: { b: { c: 1 } } }, { a: { b: { c: 2, d: 3 } } });
      const diffMap = new Map(diffs.map((d) => [d.path, d]));

      expect(diffMap.has('a.b.c')).toBe(true);
      expect(diffMap.get('a.b.c')?.op).toBe('replace');
      expect(diffMap.has('a.b.d')).toBe(true);
      expect(diffMap.get('a.b.d')?.op).toBe('add');
    });

    it('应比较数组', () => {
      const diffs = deepDiff([1, 2, 3], [1, 4, 3, 5]);
      const diffMap = new Map(diffs.map((d) => [d.path, d]));

      expect(diffMap.get('1')?.op).toBe('replace');
      expect(diffMap.get('3')?.op).toBe('add');
    });

    it('null 和 undefined 应被视为不同', () => {
      const diffs1 = deepDiff({ a: null }, { a: undefined });
      expect(diffs1.length).toBeGreaterThan(0);

      const diffs2 = deepDiff({ a: undefined }, { a: null });
      expect(diffs2.length).toBeGreaterThan(0);
    });
  });

  describe('applyPatch', () => {
    it('应应用补丁到对象', () => {
      const obj = { a: 1, b: 2 };
      const patches = [
        { path: 'b', op: 'replace' as const, oldValue: 2, newValue: 3 },
        { path: 'c', op: 'add' as const, newValue: 4 },
      ];

      const result = applyPatch(obj, patches) as Record<string, unknown>;
      expect(result.a).toBe(1);
      expect(result.b).toBe(3);
      expect(result.c).toBe(4);
    });

    it('应用补丁不应修改原对象', () => {
      const obj = { a: 1 };
      const patches = [{ path: 'a', op: 'replace' as const, oldValue: 1, newValue: 2 }];

      applyPatch(obj, patches);
      expect(obj.a).toBe(1);
    });

    it('应能处理嵌套路径', () => {
      const obj = { a: { b: 1 } };
      const patches = [{ path: 'a.c', op: 'add' as const, newValue: 2 }];

      const result = applyPatch(obj, patches) as Record<string, unknown>;
      expect((result.a as Record<string, unknown>).c).toBe(2);
    });
  });

  describe('reversePatch', () => {
    it('应能反转补丁', () => {
      const original = { a: 1, b: 2 };
      const modified = { a: 1, b: 3, c: 4 };

      const patches = deepDiff(original, modified);
      const reversed = reversePatch(patches);

      const result = applyPatch(modified, reversed);
      expect(result).toEqual(original);
    });

    it('反转后再反转应还原', () => {
      const patches = [
        { path: 'a', op: 'replace' as const, oldValue: 1, newValue: 2 },
        { path: 'b', op: 'add' as const, newValue: 3 },
      ];

      const reversed = reversePatch(patches);
      const doubleReversed = reversePatch(reversed);

      expect(doubleReversed).toEqual(patches);
    });
  });

  describe('边界情况', () => {
    it('应处理空字符串字段名', () => {
      const result = applyConfigChange('test-skill', '', 'value');
      expect(result.success).toBe(true);

      const config = getCurrentConfig('test-skill');
      expect(config['']).toBe('value');
    });

    it('应处理复杂嵌套值', () => {
      const complexValue = {
        nested: {
          array: [1, 2, { deep: true }],
          nullVal: null,
        },
      };

      applyConfigChange('test-skill', 'complex', complexValue);
      const config = getCurrentConfig('test-skill');

      expect(config.complex).toEqual(complexValue);
    });

    it('回滚 create 应删除字段', () => {
      applyConfigChange('test-skill', 'newField', 'value');
      rollbackLastMutation('test-skill');

      const config = getCurrentConfig('test-skill');
      expect(config.newField).toBeUndefined();
    });

    it('回滚 delete 应恢复字段', () => {
      applyConfigChange('test-skill', 'field', 'original');
      applyConfigChange('test-skill', 'field', undefined);
      rollbackLastMutation('test-skill');

      const config = getCurrentConfig('test-skill');
      expect(config.field).toBe('original');
    });

    it('回滚 update 应恢复旧值', () => {
      applyConfigChange('test-skill', 'counter', 1);
      applyConfigChange('test-skill', 'counter', 2);
      rollbackLastMutation('test-skill');

      const config = getCurrentConfig('test-skill');
      expect(config.counter).toBe(1);
    });
  });
});
