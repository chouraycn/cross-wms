/**
 * merge-patch.ts 单元测试
 *
 * 覆盖 RFC 7386 JSON Merge Patch 实现：
 * - patch 非对象 → 直接替换
 * - null → 删除键
 * - 对象 → 递归合并
 * - 原型链污染防护（__proto__ / constructor / prototype）
 * - mergeObjectArraysById 选项
 * - replaceArrayPaths 选项
 * - 原始对象不可变性
 */

import { describe, it, expect } from 'vitest';
import { applyMergePatch } from '../merge-patch.js';

describe('applyMergePatch', () => {
  it('patch 不是对象时直接替换 target', () => {
    expect(applyMergePatch({ a: 1 }, 42)).toBe(42);
    expect(applyMergePatch({ a: 1 }, 'string')).toBe('string');
    expect(applyMergePatch({ a: 1 }, [1, 2])).toEqual([1, 2]);
  });

  it('null 值删除 target 中对应键', () => {
    expect(applyMergePatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });

  it('对象递归合并（深合并）', () => {
    const result = applyMergePatch(
      { a: 1, b: { c: 2, d: 3 } },
      { b: { d: 4, e: 5 } },
    );
    expect(result).toEqual({ a: 1, b: { c: 2, d: 4, e: 5 } });
  });

  it('原始 target 不被修改', () => {
    const target = { a: 1, b: { c: 2 } };
    applyMergePatch(target, { b: { c: 3 } });
    expect(target).toEqual({ a: 1, b: { c: 2 } });
  });

  it('target 不是对象时从空对象开始', () => {
    expect(applyMergePatch(null, { a: 1 })).toEqual({ a: 1 });
    expect(applyMergePatch(42, { a: 1 })).toEqual({ a: 1 });
    expect(applyMergePatch([1, 2], { a: 1 })).toEqual({ a: 1 });
  });

  it('拒绝 __proto__ 键防止原型链污染', () => {
    const malicious = JSON.parse('{"__proto__":{"polluted":"yes"}}');
    const result = applyMergePatch({}, malicious) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual([]);
    expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
  });

  it('拒绝 constructor 与 prototype 键', () => {
    const malicious = JSON.parse('{"constructor":{"prototype":{"polluted":"yes"}},"prototype":{"x":1}}');
    const result = applyMergePatch({ keep: 1 }, malicious) as Record<string, unknown>;
    expect(Object.keys(result)).toEqual(['keep']);
  });

  it('默认情况下数组整体替换（不按 id 合并）', () => {
    const target = { items: [{ id: 'a', v: 1 }] };
    const patch = { items: [{ id: 'b', v: 2 }] };
    expect(applyMergePatch(target, patch)).toEqual({ items: [{ id: 'b', v: 2 }] });
  });

  it('mergeObjectArraysById 按 id 合并带 id 对象数组', () => {
    const target = { items: [{ id: 'a', v: 1 }, { id: 'b', v: 2 }] };
    const patch = { items: [{ id: 'b', v: 3 }, { id: 'c', v: 4 }] };
    const result = applyMergePatch(target, patch, { mergeObjectArraysById: true });
    expect(result).toEqual({
      items: [{ id: 'a', v: 1 }, { id: 'b', v: 3 }, { id: 'c', v: 4 }],
    });
  });

  it('mergeObjectArraysById 对不带 id 的 patch 条目直接追加', () => {
    const target = { items: [{ id: 'a', v: 1 }] };
    const patch = { items: [{ v: 9 }] };
    const result = applyMergePatch(target, patch, { mergeObjectArraysById: true });
    expect(result).toEqual({ items: [{ id: 'a', v: 1 }, { v: 9 }] });
  });

  it('mergeObjectArraysById 在 base 数组含非 id 对象时整体替换', () => {
    const target = { items: [{ v: 1 }] };
    const patch = { items: [{ id: 'a', v: 2 }] };
    const result = applyMergePatch(target, patch, { mergeObjectArraysById: true });
    expect(result).toEqual({ items: [{ id: 'a', v: 2 }] });
  });

  it('replaceArrayPaths 强制整体替换指定路径数组', () => {
    const target = { items: [{ id: 'a', v: 1 }] };
    const patch = { items: [{ id: 'a', v: 2 }] };
    const result = applyMergePatch(target, patch, {
      mergeObjectArraysById: true,
      replaceArrayPaths: new Set(['items']),
    });
    expect(result).toEqual({ items: [{ id: 'a', v: 2 }] });
  });

  it('patch 为空对象时返回 target 的浅拷贝', () => {
    const target = { a: 1, b: 2 };
    const result = applyMergePatch(target, {});
    expect(result).toEqual({ a: 1, b: 2 });
    expect(result).not.toBe(target);
  });
});
