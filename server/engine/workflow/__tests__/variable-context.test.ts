/**
 * VariableContext 单元测试
 *
 * 覆盖变量的 get/set/has/evaluate/merge/snapshot 等核心功能。
 */

import { describe, it, expect } from 'vitest';
import { VariableContext } from '../variable-context.js';

describe('VariableContext', () => {
  describe('基础操作', () => {
    it('应正确设置和获取变量', () => {
      const ctx = new VariableContext();
      ctx.set('name', 'test');
      expect(ctx.get('name')).toBe('test');
    });

    it('应支持初始化变量', () => {
      const ctx = new VariableContext({ a: 1, b: 'hello' });
      expect(ctx.get('a')).toBe(1);
      expect(ctx.get('b')).toBe('hello');
    });

    it('has 方法应正确判断变量是否存在', () => {
      const ctx = new VariableContext({ x: 1 });
      expect(ctx.has('x')).toBe(true);
      expect(ctx.has('y')).toBe(false);
    });

    it('应支持删除变量', () => {
      const ctx = new VariableContext({ a: 1 });
      ctx.delete('a');
      expect(ctx.has('a')).toBe(false);
    });

    it('应正确返回变量数量', () => {
      const ctx = new VariableContext({ a: 1, b: 2, c: 3 });
      expect(ctx.size).toBe(3);
    });
  });

  describe('点路径支持', () => {
    it('应支持通过点路径设置嵌套对象', () => {
      const ctx = new VariableContext();
      ctx.set('user.name', 'Alice');
      ctx.set('user.age', 25);
      expect(ctx.get('user.name')).toBe('Alice');
      expect(ctx.get('user.age')).toBe(25);
    });

    it('应支持通过点路径获取嵌套对象', () => {
      const ctx = new VariableContext({
        user: { name: 'Bob', address: { city: 'Beijing' } }
      });
      expect(ctx.get('user.name')).toBe('Bob');
      expect(ctx.get('user.address.city')).toBe('Beijing');
    });

    it('获取不存在的嵌套路径应返回 undefined', () => {
      const ctx = new VariableContext({ user: {} });
      expect(ctx.get('user.name.first')).toBeUndefined();
    });
  });

  describe('merge 方法', () => {
    it('应正确合并多个变量', () => {
      const ctx = new VariableContext({ a: 1 });
      ctx.merge({ b: 2, c: 3 });
      expect(ctx.get('a')).toBe(1);
      expect(ctx.get('b')).toBe(2);
      expect(ctx.get('c')).toBe(3);
    });

    it('merge 应覆盖已存在的变量', () => {
      const ctx = new VariableContext({ a: 1 });
      ctx.merge({ a: 2 });
      expect(ctx.get('a')).toBe(2);
    });
  });

  describe('snapshot 方法', () => {
    it('应返回所有变量的快照', () => {
      const ctx = new VariableContext({ a: 1, b: 'test' });
      const snap = ctx.snapshot();
      expect(snap).toEqual({ a: 1, b: 'test' });
    });

    it('snapshot 应返回浅拷贝', () => {
      const ctx = new VariableContext({ obj: { x: 1 } });
      const snap = ctx.snapshot();
      snap.obj.x = 2;
      expect(ctx.get('obj.x')).toBe(2);
    });
  });

  describe('evaluate 表达式求值', () => {
    it('应正确解析简单变量插值', () => {
      const ctx = new VariableContext({ name: 'world' });
      expect(ctx.evaluate('{{name}}')).toBe('world');
    });

    it('应正确解析字符串插值', () => {
      const ctx = new VariableContext({ name: 'world' });
      expect(ctx.evaluate('Hello, {{name}}!')).toBe('Hello, world!');
    });

    it('应正确计算简单数学表达式', () => {
      const ctx = new VariableContext({ x: 10, y: 5 });
      expect(ctx.evaluate('x + y')).toBe(15);
      expect(ctx.evaluate('x * y')).toBe(50);
    });

    it('表达式求值出错时应返回 undefined', () => {
      const ctx = new VariableContext();
      expect(ctx.evaluate('invalid syntax !!!')).toBeUndefined();
    });
  });
});
