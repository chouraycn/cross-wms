import { describe, it, expect, beforeEach } from 'vitest';
import { getMethodRegistry, registerGatewayMethod, unregisterGatewayMethod } from '../methodRegistry.js';

describe('MethodRegistry 模块单元测试', () => {
  beforeEach(() => {
    getMethodRegistry().clear();
  });

  describe('方法注册', () => {
    it('应该能够注册方法', () => {
      const handler = async () => ({ result: 'test' });
      registerGatewayMethod('test.method', handler);

      expect(getMethodRegistry().has('test.method')).toBe(true);
    });

    it('应该能够取消注册方法', () => {
      const handler = async () => ({ result: 'test' });
      registerGatewayMethod('test.method', handler);
      unregisterGatewayMethod('test.method');

      expect(getMethodRegistry().has('test.method')).toBe(false);
    });

    it('取消注册不存在的方法应该返回 false', () => {
      expect(unregisterGatewayMethod('nonexistent.method')).toBe(false);
    });
  });

  describe('方法调用', () => {
    it('应该能够调用已注册的方法', async () => {
      const handler = async (params: unknown) => ({ received: params });
      registerGatewayMethod('test.invoke', handler);

      const result = await getMethodRegistry().invoke('test.invoke', { foo: 'bar' }, { clientId: 'test' });

      expect(result.ok).toBe(true);
      expect(result.result).toEqual({ received: { foo: 'bar' } });
    });

    it('调用不存在的方法应该返回错误', async () => {
      const result = await getMethodRegistry().invoke('nonexistent.method', {}, { clientId: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('METHOD_NOT_FOUND');
    });

    it('方法执行异常应该被捕获并返回错误', async () => {
      const handler = async () => {
        throw new Error('Test error');
      };
      registerGatewayMethod('test.error', handler);

      const result = await getMethodRegistry().invoke('test.error', {}, { clientId: 'test' });

      expect(result.ok).toBe(false);
      expect(result.error?.code).toBe('Error');
      expect(result.error?.message).toBe('Test error');
    });
  });

  describe('方法列表', () => {
    it('应该返回已注册方法的排序列表', () => {
      registerGatewayMethod('z.method', async () => ({}));
      registerGatewayMethod('a.method', async () => ({}));
      registerGatewayMethod('m.method', async () => ({}));

      const methods = getMethodRegistry().listMethods();

      expect(methods).toEqual(['a.method', 'm.method', 'z.method']);
    });

    it('应该返回空数组当没有注册方法', () => {
      const methods = getMethodRegistry().listMethods();

      expect(methods).toEqual([]);
    });
  });

  describe('单例模式', () => {
    it('应该始终返回同一个实例', () => {
      const instance1 = getMethodRegistry();
      const instance2 = getMethodRegistry();

      expect(instance1).toBe(instance2);
    });
  });
});