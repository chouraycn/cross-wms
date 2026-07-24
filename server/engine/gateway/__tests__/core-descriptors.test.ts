// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  CORE_GATEWAY_METHOD_SPECS,
  STARTUP_UNAVAILABLE_GATEWAY_METHODS,
  listCoreAdvertisedGatewayMethodNames,
  listCoreGatewayMethodNames,
  resolveCoreGatewayMethodScope,
  resolveCoreOperatorGatewayMethodScope,
  isCoreNodeGatewayMethod,
  isDynamicOperatorGatewayMethod,
  isCoreGatewayMethodClassified,
  createCoreGatewayMethodDescriptors,
} from '../methods/core-descriptors.js';
import {
  NODE_GATEWAY_METHOD_SCOPE,
  DYNAMIC_GATEWAY_METHOD_SCOPE,
} from '../methods/descriptor.js';
import {
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
} from '../operator-scopes.js';

describe('methods/core-descriptors', () => {
  describe('CORE_GATEWAY_METHOD_SPECS', () => {
    it('应为非空只读数组', () => {
      expect(Array.isArray(CORE_GATEWAY_METHOD_SPECS)).toBe(true);
      expect(CORE_GATEWAY_METHOD_SPECS.length).toBeGreaterThan(50);
    });

    it('每个 spec 都应有 name 与 scope', () => {
      for (const spec of CORE_GATEWAY_METHOD_SPECS) {
        expect(typeof spec.name).toBe('string');
        expect(spec.name.length).toBeGreaterThan(0);
        expect(spec.scope).toBeDefined();
      }
    });

    it('不应有重复 name', () => {
      const names = CORE_GATEWAY_METHOD_SPECS.map((s) => s.name);
      const unique = new Set(names);
      expect(unique.size).toBe(names.length);
    });
  });

  describe('STARTUP_UNAVAILABLE_GATEWAY_METHODS', () => {
    it('应包含标记 startup:true 的方法', () => {
      expect(STARTUP_UNAVAILABLE_GATEWAY_METHODS).toContain('models.list');
      expect(STARTUP_UNAVAILABLE_GATEWAY_METHODS).toContain('sessions.list');
      expect(STARTUP_UNAVAILABLE_GATEWAY_METHODS).toContain('sessions.send');
    });

    it('不应包含未标记 startup 的方法', () => {
      expect(STARTUP_UNAVAILABLE_GATEWAY_METHODS).not.toContain('health');
      expect(STARTUP_UNAVAILABLE_GATEWAY_METHODS).not.toContain('config.set');
    });
  });

  describe('listCoreAdvertisedGatewayMethodNames', () => {
    it('应返回数组', () => {
      const list = listCoreAdvertisedGatewayMethodNames();
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBeGreaterThan(0);
    });

    it('应包含 health（默认 advertised）', () => {
      expect(listCoreAdvertisedGatewayMethodNames()).toContain('health');
    });

    it('不应包含 advertise:false 的方法', () => {
      const advertised = listCoreAdvertisedGatewayMethodNames();
      expect(advertised).not.toContain('assistant.media.get');
      expect(advertised).not.toContain('sessions.get');
      expect(advertised).not.toContain('connect');
    });
  });

  describe('listCoreGatewayMethodNames', () => {
    it('应返回所有方法名（包括隐藏的）', () => {
      const all = listCoreGatewayMethodNames();
      expect(all).toContain('health');
      expect(all).toContain('assistant.media.get');
      expect(all).toContain('sessions.get');
      expect(all).toContain('connect');
    });

    it('长度应大于 advertised 长度', () => {
      expect(listCoreGatewayMethodNames().length).toBeGreaterThan(
        listCoreAdvertisedGatewayMethodNames().length,
      );
    });
  });

  describe('resolveCoreGatewayMethodScope', () => {
    it('health 应返回 read scope', () => {
      expect(resolveCoreGatewayMethodScope('health')).toBe(READ_SCOPE);
    });

    it('sessions.send 应返回 write scope', () => {
      expect(resolveCoreGatewayMethodScope('sessions.send')).toBe(WRITE_SCOPE);
    });

    it('config.set 应返回 admin scope', () => {
      expect(resolveCoreGatewayMethodScope('config.set')).toBe(ADMIN_SCOPE);
    });

    it('node.event 应返回 node scope', () => {
      expect(resolveCoreGatewayMethodScope('node.event')).toBe(NODE_GATEWAY_METHOD_SCOPE);
    });

    it('plugins.sessionAction 应返回 dynamic scope', () => {
      expect(resolveCoreGatewayMethodScope('plugins.sessionAction')).toBe(
        DYNAMIC_GATEWAY_METHOD_SCOPE,
      );
    });

    it('未知方法应返回 undefined', () => {
      expect(resolveCoreGatewayMethodScope('unknown.method')).toBeUndefined();
    });
  });

  describe('resolveCoreOperatorGatewayMethodScope', () => {
    it('health 应返回 read scope', () => {
      expect(resolveCoreOperatorGatewayMethodScope('health')).toBe(READ_SCOPE);
    });

    it('node-role 方法应返回 undefined', () => {
      expect(resolveCoreOperatorGatewayMethodScope('node.event')).toBeUndefined();
    });

    it('dynamic 方法应返回 undefined', () => {
      expect(resolveCoreOperatorGatewayMethodScope('plugins.sessionAction')).toBeUndefined();
    });
  });

  describe('isCoreNodeGatewayMethod', () => {
    it('node.event 应为 true', () => {
      expect(isCoreNodeGatewayMethod('node.event')).toBe(true);
    });

    it('node.invoke.result 应为 true', () => {
      expect(isCoreNodeGatewayMethod('node.invoke.result')).toBe(true);
    });

    it('health 应为 false', () => {
      expect(isCoreNodeGatewayMethod('health')).toBe(false);
    });
  });

  describe('isDynamicOperatorGatewayMethod', () => {
    it('plugins.sessionAction 应为 true', () => {
      expect(isDynamicOperatorGatewayMethod('plugins.sessionAction')).toBe(true);
    });

    it('health 应为 false', () => {
      expect(isDynamicOperatorGatewayMethod('health')).toBe(false);
    });
  });

  describe('isCoreGatewayMethodClassified', () => {
    it('已知方法应返回 true', () => {
      expect(isCoreGatewayMethodClassified('health')).toBe(true);
      expect(isCoreGatewayMethodClassified('node.event')).toBe(true);
    });

    it('未知方法应返回 false', () => {
      expect(isCoreGatewayMethodClassified('unknown.method')).toBe(false);
    });
  });

  describe('createCoreGatewayMethodDescriptors', () => {
    it('应仅包含提供 handler 的方法', () => {
      const handler = () => undefined;
      const descriptors = createCoreGatewayMethodDescriptors({
        health: handler,
        status: handler,
      });
      const names = descriptors.map((d) => d.name);
      expect(names).toContain('health');
      expect(names).toContain('status');
      expect(names).not.toContain('config.set');
    });

    it('应保留 scope 元数据', () => {
      const handler = () => undefined;
      const descriptors = createCoreGatewayMethodDescriptors({ health: handler });
      const healthDesc = descriptors.find((d) => d.name === 'health');
      expect(healthDesc?.scope).toBe(READ_SCOPE);
      expect(healthDesc?.owner).toEqual({ kind: 'core', area: 'gateway' });
    });

    it('startup 标记方法应附带 startup 可用性元数据', () => {
      const handler = () => undefined;
      const descriptors = createCoreGatewayMethodDescriptors({
        'models.list': handler,
      });
      const desc = descriptors.find((d) => d.name === 'models.list');
      expect(desc?.startup).toBe('unavailable-until-sidecars');
    });

    it('advertise:false 方法应附带 advertise:false 标记', () => {
      const handler = () => undefined;
      const descriptors = createCoreGatewayMethodDescriptors({
        connect: handler,
      });
      const desc = descriptors.find((d) => d.name === 'connect');
      expect(desc?.advertise).toBe(false);
    });

    it('controlPlaneWrite 方法应附带 controlPlaneWrite:true 标记', () => {
      const handler = () => undefined;
      const descriptors = createCoreGatewayMethodDescriptors({
        'config.apply': handler,
      });
      const desc = descriptors.find((d) => d.name === 'config.apply');
      expect(desc?.controlPlaneWrite).toBe(true);
    });

    it('未分类 handler 应抛出错误', () => {
      const handler = () => undefined;
      expect(() =>
        createCoreGatewayMethodDescriptors({
          'unknown.unclassified.method': handler,
        } as never),
      ).toThrow(/missing a descriptor/);
    });

    it('无 handler 的 spec 不应出现在结果中', () => {
      const descriptors = createCoreGatewayMethodDescriptors({});
      expect(descriptors).toHaveLength(0);
    });
  });
});
