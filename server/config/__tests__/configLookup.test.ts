/**
 * ConfigLookup 单元测试
 *
 * 覆盖：
 * - get / set / has / delete 的点号路径操作
 * - 中间对象自动创建
 * - 边界情况（空路径、数组覆盖、不存在路径）
 */

import { describe, it, expect } from 'vitest';
import { ConfigLookup } from '../configLookup.js';

describe('ConfigLookup', () => {
  it('应通过构造函数初始化', () => {
    const lookup = new ConfigLookup({ a: 1 });
    expect(lookup.get('a')).toBe(1);
  });

  it('get 应支持点号路径', () => {
    const lookup = new ConfigLookup({
      models: { default: 'gpt-4', fallback: 'gpt-3.5' },
    });
    expect(lookup.get('models.default')).toBe('gpt-4');
    expect(lookup.get('models.fallback')).toBe('gpt-3.5');
  });

  it('get 不存在路径应返回 undefined', () => {
    const lookup = new ConfigLookup({});
    expect(lookup.get('a.b.c')).toBeUndefined();
  });

  it('get 遇到非对象中间值应返回 undefined', () => {
    const lookup = new ConfigLookup({ a: 'string' });
    expect(lookup.get('a.b')).toBeUndefined();
  });

  it('set 应支持点号路径并自动创建中间对象', () => {
    const lookup = new ConfigLookup();
    lookup.set('server.port', 3001);
    expect(lookup.get('server')).toEqual({ port: 3001 });
    expect(lookup.get('server.port')).toBe(3001);
  });

  it('set 应覆盖已有值', () => {
    const lookup = new ConfigLookup({ a: { b: 1 } });
    lookup.set('a.b', 2);
    expect(lookup.get('a.b')).toBe(2);
  });

  it('set 遇到数组中间值时应替换为对象', () => {
    const lookup = new ConfigLookup({ a: [1, 2, 3] });
    lookup.set('a.b', 'value');
    expect(lookup.get('a')).toEqual({ b: 'value' });
  });

  it('has 应正确判断存在路径', () => {
    const lookup = new ConfigLookup({ a: { b: 1 } });
    expect(lookup.has('a')).toBe(true);
    expect(lookup.has('a.b')).toBe(true);
  });

  it('has 应正确判断不存在路径', () => {
    const lookup = new ConfigLookup({ a: { b: 1 } });
    expect(lookup.has('a.c')).toBe(false);
    expect(lookup.has('x.y.z')).toBe(false);
  });

  it('has 应区分为 undefined 但存在的属性', () => {
    const lookup = new ConfigLookup({ a: { b: undefined } });
    expect(lookup.has('a.b')).toBe(true);
  });

  it('delete 应删除存在的路径', () => {
    const lookup = new ConfigLookup({ a: { b: 1, c: 2 } });
    lookup.delete('a.b');
    expect(lookup.has('a.b')).toBe(false);
    expect(lookup.has('a.c')).toBe(true);
  });

  it('delete 不存在的路径应静默处理', () => {
    const lookup = new ConfigLookup({});
    expect(() => lookup.delete('a.b')).not.toThrow();
  });

  it('delete 遇到非对象中间值应静默处理', () => {
    const lookup = new ConfigLookup({ a: 'string' });
    expect(() => lookup.delete('a.b')).not.toThrow();
  });

  it('toObject 应返回存储副本', () => {
    const lookup = new ConfigLookup({ a: 1 });
    const obj = lookup.toObject();
    expect(obj).toEqual({ a: 1 });
    // 修改副本不影响内部
    obj.a = 2;
    expect(lookup.get('a')).toBe(1);
  });

  it('replace 应完全替换内部存储', () => {
    const lookup = new ConfigLookup({ a: 1 });
    lookup.replace({ b: 2 });
    expect(lookup.get('a')).toBeUndefined();
    expect(lookup.get('b')).toBe(2);
  });

  it('空字符串路径应视为无效', () => {
    const lookup = new ConfigLookup();
    lookup.set('', 'value');
    expect(lookup.toObject()).toEqual({});
    expect(lookup.get('')).toBeUndefined();
    expect(lookup.has('')).toBe(false);
    expect(() => lookup.delete('')).not.toThrow();
  });

  it('多级深层路径应正常工作', () => {
    const lookup = new ConfigLookup();
    lookup.set('a.b.c.d.e', 'deep');
    expect(lookup.get('a.b.c.d.e')).toBe('deep');
    expect(lookup.get('a.b.c.d')).toEqual({ e: 'deep' });
  });

  // ===================== 压力测试与边界测试 =====================

  describe('深层嵌套（10 层）压力测试', () => {
    it('10 层 set 后 get 应能正确读取每一层', () => {
      const lookup = new ConfigLookup();
      const path = 'l1.l2.l3.l4.l5.l6.l7.l8.l9.l10';
      lookup.set(path, 'deep-value');

      expect(lookup.get(path)).toBe('deep-value');
      // 验证每一层都正确创建
      expect(lookup.get('l1.l2.l3.l4.l5.l6.l7.l8.l9')).toEqual({ l10: 'deep-value' });
      expect(lookup.get('l1.l2.l3.l4.l5.l6.l7.l8')).toEqual({
        l9: { l10: 'deep-value' },
      });
      // has 应识别所有路径
      expect(lookup.has(path)).toBe(true);
      expect(lookup.has('l1.l2.l3.l4.l5.l6.l7.l8.l9.l10')).toBe(true);
    });

    it('10 层 delete 后路径应被移除', () => {
      const lookup = new ConfigLookup();
      const path = 'a.b.c.d.e.f.g.h.i.j';
      lookup.set(path, 'value');
      expect(lookup.has(path)).toBe(true);

      // 删除中间节点
      lookup.delete('a.b.c.d.e.f.g.h.i.j');
      expect(lookup.has(path)).toBe(false);
      // 父节点仍存在
      expect(lookup.has('a.b.c.d.e.f.g.h.i')).toBe(true);
    });

    it('10 层结构中部分节点存在部分不存在的混合测试', () => {
      const lookup = new ConfigLookup({
        a: { b: { c: { d: { e: { f: { g: { h: { i: { j: 'present' } } } } } } } } },
      });
      // 存在的路径
      expect(lookup.has('a.b.c.d.e.f.g.h.i.j')).toBe(true);
      // 不存在的兄弟节点
      expect(lookup.has('a.b.c.d.e.f.g.h.i.k')).toBe(false);
      // 不存在的父节点分支
      expect(lookup.has('a.b.c.d.e.f.g.h.x.y')).toBe(false);
      // get 不存在路径
      expect(lookup.get('a.b.c.d.e.f.g.h.i.k')).toBeUndefined();
    });

    it('10 层 set 1000 次性能测试', () => {
      const lookup = new ConfigLookup();
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        lookup.set(`l1.l2.l3.l4.l5.l6.l7.l8.l9.l${i % 10}`, i);
      }
      const writeDuration = performance.now() - start;

      const readStart = performance.now();
      for (let i = 0; i < 1000; i++) {
        lookup.get(`l1.l2.l3.l4.l5.l6.l7.l8.l9.l${i % 10}`);
      }
      const readDuration = performance.now() - readStart;

      // 1000 次 10 层 set 应在 1s 内完成
      expect(writeDuration).toBeLessThan(1000);
      // 1000 次 10 层 get 应在 500ms 内完成
      expect(readDuration).toBeLessThan(500);
    });
  });

  describe('特殊字符键测试', () => {
    it('应正确处理键 a.b.c（看似多级但作为字面键）', () => {
      // 注意：当前 ConfigLookup 会将 'a.b.c' 拆分为 ['a','b','c']，
      // 因此这是嵌套键 a.b.c，而不是字面 'a.b.c'。该测试验证嵌套行为
      const lookup = new ConfigLookup();
      lookup.set('a.b.c', 'nested');
      expect(lookup.get('a.b.c')).toBe('nested');
      expect(lookup.get('a')).toEqual({ b: { c: 'nested' } });
    });

    it('应处理 a..b 路径（连续点号会被压缩为单层）', () => {
      // splitKey 会过滤空段，所以 'a..b' 实际被解析为 ['a', 'b']
      const lookup = new ConfigLookup();
      lookup.set('a..b', 'value');
      expect(lookup.get('a.b')).toBe('value');
      expect(lookup.has('a.b')).toBe(true);
    });

    it('空键应被忽略（视为无效路径）', () => {
      const lookup = new ConfigLookup({ a: 1 });
      lookup.set('', 'ignored');
      // 不应影响现有数据
      expect(lookup.get('a')).toBe(1);
      // 也不应创建新的空字符串键
      expect(lookup.has('')).toBe(false);
      expect(lookup.get('')).toBeUndefined();
    });

    it('仅包含空格或点号的键应被忽略', () => {
      const lookup = new ConfigLookup();
      lookup.set('   ', 'ignored');
      lookup.set('.', 'ignored');
      lookup.set('..', 'ignored');
      lookup.set(' . . ', 'ignored');
      expect(lookup.toObject()).toEqual({});
    });

    it('首尾带空格的键应被自动 trim 后处理', () => {
      const lookup = new ConfigLookup();
      lookup.set('  a.b  ', 'value');
      expect(lookup.get('a.b')).toBe('value');
      expect(lookup.has('a.b')).toBe(true);
    });

    it('包含中文键名应正常处理', () => {
      const lookup = new ConfigLookup();
      lookup.set('系统.模型.默认', 'gpt-4');
      expect(lookup.get('系统.模型.默认')).toBe('gpt-4');
      expect(lookup.has('系统.模型.默认')).toBe(true);
    });

    it('混合数字键名应正常处理', () => {
      const lookup = new ConfigLookup();
      lookup.set('list.0.name', 'first');
      lookup.set('list.1.name', 'second');
      expect(lookup.get('list.0.name')).toBe('first');
      expect(lookup.get('list.1.name')).toBe('second');
    });
  });

  describe('覆盖整个对象的 set 测试', () => {
    it('set 一个对象值应整体覆盖该路径', () => {
      const lookup = new ConfigLookup({ a: { b: 1, c: 2 } });
      lookup.set('a', { x: 10, y: 20 });
      expect(lookup.get('a')).toEqual({ x: 10, y: 20 });
      expect(lookup.has('a.b')).toBe(false);
      expect(lookup.has('a.c')).toBe(false);
      expect(lookup.has('a.x')).toBe(true);
      expect(lookup.has('a.y')).toBe(true);
    });

    it('set 一个数组值应整体替换（非合并）', () => {
      const lookup = new ConfigLookup({ a: [1, 2, 3] });
      lookup.set('a', [10, 20]);
      expect(lookup.get('a')).toEqual([10, 20]);
    });

    it('set null 值应清空该路径', () => {
      const lookup = new ConfigLookup({ a: { b: 1, c: 2 } });
      lookup.set('a', null);
      expect(lookup.get('a')).toBeNull();
      expect(lookup.has('a')).toBe(true);
    });

    it('set undefined 值应保留路径但值为 undefined', () => {
      const lookup = new ConfigLookup({ a: 1 });
      lookup.set('a', undefined);
      expect(lookup.get('a')).toBeUndefined();
      // has 通过 'in' 检查，因此 undefined 也算存在
      expect(lookup.has('a')).toBe(true);
    });

    it('set 根级键应替换整个对象', () => {
      const lookup = new ConfigLookup({ a: 1, b: { c: 2 } });
      lookup.set('root', { d: 3 });
      // 根级其他键不受影响
      expect(lookup.get('a')).toBe(1);
      expect(lookup.get('b.c')).toBe(2);
      expect(lookup.get('root.d')).toBe(3);
    });
  });
});
