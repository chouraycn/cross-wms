/**
 * Plugin Slots Contract 测试
 *
 * 覆盖 slots.ts 的契约行为：
 * - normalizeKinds（数组/字符串/undefined）
 * - hasKind（includes/相等）
 * - kindsEqual（顺序无关）
 * - slotKeysForPluginKind（kind→slot 映射）
 * - defaultSlotIdForKey
 * - applyExclusiveSlotSelection
 * - Slots 类（get/set/applySelection/reset）
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeKinds,
  hasKind,
  kindsEqual,
  slotKeysForPluginKind,
  defaultSlotIdForKey,
  applyExclusiveSlotSelection,
  Slots,
  slots,
} from '../slots.js';
import type { PluginCapabilityKind } from '../types.js';

describe('Plugin Slots Contract', () => {
  describe('normalizeKinds', () => {
    it('undefined 返回空数组', () => {
      expect(normalizeKinds(undefined)).toEqual([]);
    });

    it('字符串单值包装为数组', () => {
      expect(normalizeKinds('tool')).toEqual(['tool']);
    });

    it('数组原样返回', () => {
      expect(normalizeKinds(['tool', 'hook'])).toEqual(['tool', 'hook']);
    });

    it('空数组原样返回', () => {
      expect(normalizeKinds([])).toEqual([]);
    });
  });

  describe('hasKind', () => {
    it('undefined 不包含任何 kind', () => {
      expect(hasKind(undefined, 'tool')).toBe(false);
    });

    it('字符串相等', () => {
      expect(hasKind('tool', 'tool')).toBe(true);
      expect(hasKind('tool', 'hook')).toBe(false);
    });

    it('数组 includes', () => {
      expect(hasKind(['tool', 'hook'], 'hook')).toBe(true);
      expect(hasKind(['tool', 'hook'], 'service')).toBe(false);
    });
  });

  describe('kindsEqual', () => {
    it('相同单值相等', () => {
      expect(kindsEqual('tool', 'tool')).toBe(true);
    });

    it('单值 vs 数组（包含该值）相等', () => {
      expect(kindsEqual('tool', ['tool'])).toBe(true);
    });

    it('不同内容不相等', () => {
      expect(kindsEqual('tool', 'hook')).toBe(false);
    });

    it('数组顺序无关', () => {
      expect(kindsEqual(['a', 'b'], ['b', 'a'])).toBe(true);
    });

    it('不同数量不相等', () => {
      expect(kindsEqual(['a'], ['a', 'b'])).toBe(false);
    });

    it('undefined 与 undefined 相等', () => {
      expect(kindsEqual(undefined, undefined)).toBe(true);
    });
  });

  describe('slotKeysForPluginKind', () => {
    it('memory-host 映射到 memory', () => {
      expect(slotKeysForPluginKind('memory-host')).toEqual(['memory']);
    });

    it('tool 等映射到 contextEngine', () => {
      const keys = slotKeysForPluginKind('tool');
      expect(keys).toContain('contextEngine');
    });

    it('数组多 kind 返回多个 slot', () => {
      const keys = slotKeysForPluginKind(['tool', 'memory-host']);
      expect(keys).toContain('contextEngine');
      expect(keys).toContain('memory');
    });

    it('undefined 返回空数组', () => {
      expect(slotKeysForPluginKind(undefined)).toEqual([]);
    });
  });

  describe('defaultSlotIdForKey', () => {
    it('memory 默认 memory-core', () => {
      expect(defaultSlotIdForKey('memory')).toBe('memory-core');
    });

    it('contextEngine 默认 legacy', () => {
      expect(defaultSlotIdForKey('contextEngine')).toBe('legacy');
    });
  });

  describe('applyExclusiveSlotSelection', () => {
    it('未指定 kind 时不改变 currentSlots', () => {
      const result = applyExclusiveSlotSelection({
        currentSlots: { memory: 'old', contextEngine: 'old' },
        selectedId: 'newPlugin',
        selectedKind: undefined,
      });
      expect(result.changed).toBe(false);
    });

    it('kind 映射到 slot 时切换 slot', () => {
      const result = applyExclusiveSlotSelection({
        currentSlots: { memory: 'memory-core', contextEngine: 'legacy' },
        selectedId: 'newMem',
        selectedKind: 'memory-host',
      });
      expect(result.changed).toBe(true);
      expect(result.slots.memory).toBe('newMem');
    });

    it('slot 未变化时 changed=false', () => {
      const result = applyExclusiveSlotSelection({
        currentSlots: { memory: 'same', contextEngine: 'legacy' },
        selectedId: 'same',
        selectedKind: 'memory-host',
      });
      expect(result.changed).toBe(false);
    });

    it('返回 warnings 标记切换', () => {
      const result = applyExclusiveSlotSelection({
        currentSlots: { memory: 'old', contextEngine: 'legacy' },
        selectedId: 'new',
        selectedKind: 'memory-host',
      });
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('memory');
    });
  });

  describe('Slots 类', () => {
    let s: Slots;

    it('get/set 操作 slot', () => {
      s = new Slots();
      expect(s.get('memory')).toBe('memory-core');
      s.set('memory', 'custom-mem');
      expect(s.get('memory')).toBe('custom-mem');
    });

    it('getAll 返回所有 slot 副本', () => {
      s = new Slots();
      const all = s.getAll();
      expect(all.memory).toBe('memory-core');
      expect(all.contextEngine).toBe('legacy');
    });

    it('applySelection 返回 SlotSelectionResult', () => {
      s = new Slots();
      const result = s.applySelection('custom', 'memory-host');
      // applySelection 计算结果但不自动应用
      expect(result.changed).toBe(true);
      expect(result.slots.memory).toBe('custom');
    });

    it('reset 恢复默认 slot', () => {
      s = new Slots();
      s.set('memory', 'modified');
      s.reset();
      expect(s.get('memory')).toBe('memory-core');
    });

    it('手动 set 与 applySelection 组合使用', () => {
      s = new Slots();
      const result = s.applySelection('custom', 'memory-host');
      s.set('memory', result.slots.memory);
      expect(s.get('memory')).toBe('custom');
    });
  });

  describe('全局 slots 单例', () => {
    it('存在全局 Slots 实例', () => {
      expect(slots).toBeInstanceOf(Slots);
    });
  });
});
