// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  createGatewayMethodRegistry,
  createGatewayMethodDescriptorsFromHandlers,
  createPluginGatewayMethodDescriptor,
  createPluginGatewayMethodDescriptors,
} from '../methods/registry.js';
import {
  ADMIN_SCOPE,
  READ_SCOPE,
  WRITE_SCOPE,
} from '../operator-scopes.js';
import {
  NODE_GATEWAY_METHOD_SCOPE,
  DYNAMIC_GATEWAY_METHOD_SCOPE,
} from '../methods/descriptor.js';

const noop = () => undefined;

describe('methods/registry', () => {
  describe('createGatewayMethodRegistry', () => {
    it('应创建只读 registry 视图', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'test.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(typeof registry.getHandler).toBe('function');
      expect(typeof registry.listMethods).toBe('function');
      expect(typeof registry.listAdvertisedMethods).toBe('function');
      expect(typeof registry.getScope).toBe('function');
      expect(typeof registry.isStartupUnavailable).toBe('function');
      expect(typeof registry.isControlPlaneWrite).toBe('function');
      expect(typeof registry.descriptors).toBe('function');
    });

    it('getHandler 应返回已注册的 handler', () => {
      const handler = () => 'ok';
      const registry = createGatewayMethodRegistry([
        {
          name: 'test.get',
          handler,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.getHandler('test.get')).toBe(handler);
    });

    it('getHandler 未注册方法应返回 undefined', () => {
      const registry = createGatewayMethodRegistry([]);
      expect(registry.getHandler('unknown')).toBeUndefined();
    });

    it('listMethods 应返回所有方法名', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'a.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
        {
          name: 'b.method',
          handler: noop,
          scope: WRITE_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.listMethods()).toEqual(['a.method', 'b.method']);
    });

    it('listAdvertisedMethods 应排除 advertise:false 的方法', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'visible.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
        {
          name: 'hidden.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
          advertise: false,
        },
      ]);
      expect(registry.listAdvertisedMethods()).toEqual(['visible.method']);
    });

    it('getScope 应返回方法 scope', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'read.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.getScope('read.method')).toBe(READ_SCOPE);
    });

    it('getScope 未注册方法应返回 undefined', () => {
      const registry = createGatewayMethodRegistry([]);
      expect(registry.getScope('unknown')).toBeUndefined();
    });

    it('isStartupUnavailable 应识别 startup-until-sidecars 方法', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'lazy.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
          startup: 'unavailable-until-sidecars',
        },
        {
          name: 'eager.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.isStartupUnavailable('lazy.method')).toBe(true);
      expect(registry.isStartupUnavailable('eager.method')).toBe(false);
    });

    it('isControlPlaneWrite 应识别 controlPlaneWrite 方法', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'write.cp',
          handler: noop,
          scope: ADMIN_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
          controlPlaneWrite: true,
        },
        {
          name: 'plain.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.isControlPlaneWrite('write.cp')).toBe(true);
      expect(registry.isControlPlaneWrite('plain.method')).toBe(false);
    });

    it('descriptors 应返回所有 descriptor', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: 'a.method',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      const descs = registry.descriptors();
      expect(descs).toHaveLength(1);
      expect(descs[0].name).toBe('a.method');
    });

    it('重复方法名应抛出错误', () => {
      expect(() =>
        createGatewayMethodRegistry([
          {
            name: 'dup.method',
            handler: noop,
            scope: READ_SCOPE,
            owner: { kind: 'core', area: 'gateway' },
          },
          {
            name: 'dup.method',
            handler: noop,
            scope: WRITE_SCOPE,
            owner: { kind: 'core', area: 'gateway' },
          },
        ]),
      ).toThrow(/already registered/);
    });

    it('空 name 应抛出错误', () => {
      expect(() =>
        createGatewayMethodRegistry([
          {
            name: '   ',
            handler: noop,
            scope: READ_SCOPE,
            owner: { kind: 'core', area: 'gateway' },
          },
        ]),
      ).toThrow(/must not be empty/);
    });

    it('缺失 scope 应抛出错误', () => {
      expect(() =>
        createGatewayMethodRegistry([
          {
            name: 'no.scope',
            handler: noop,
            scope: undefined,
            owner: { kind: 'core', area: 'gateway' },
          } as never,
        ]),
      ).toThrow(/missing a scope/);
    });

    it('应规范化方法名（去除空白）', () => {
      const registry = createGatewayMethodRegistry([
        {
          name: '  spaced.method  ',
          handler: noop,
          scope: READ_SCOPE,
          owner: { kind: 'core', area: 'gateway' },
        },
      ]);
      expect(registry.listMethods()).toEqual(['spaced.method']);
    });
  });

  describe('createGatewayMethodDescriptorsFromHandlers', () => {
    it('应将 handler map 转换为 descriptors', () => {
      const descriptors = createGatewayMethodDescriptorsFromHandlers({
        handlers: { 'a.method': noop, 'b.method': noop },
        owner: { kind: 'channel', channelId: 'ch1' },
        defaultScope: READ_SCOPE,
      });
      expect(descriptors).toHaveLength(2);
      expect(descriptors[0].scope).toBe(READ_SCOPE);
      expect(descriptors[0].owner).toEqual({ kind: 'channel', channelId: 'ch1' });
    });

    it('per-method scope 应覆盖 defaultScope', () => {
      const descriptors = createGatewayMethodDescriptorsFromHandlers({
        handlers: { 'a.method': noop },
        owner: { kind: 'aux', area: 'area1' },
        defaultScope: READ_SCOPE,
        scopes: { 'a.method': ADMIN_SCOPE },
      });
      expect(descriptors[0].scope).toBe(ADMIN_SCOPE);
    });

    it('未提供 defaultScope 且无 per-method scope 应抛出', () => {
      expect(() =>
        createGatewayMethodDescriptorsFromHandlers({
          handlers: { 'a.method': noop },
          owner: { kind: 'aux', area: 'area1' },
        }),
      ).toThrow(/missing a scope/);
    });
  });

  describe('createPluginGatewayMethodDescriptor', () => {
    it('应创建 plugin-owned descriptor', () => {
      const descriptor = createPluginGatewayMethodDescriptor({
        pluginId: 'myplugin',
        name: 'myplugin.action',
        handler: noop,
        scope: WRITE_SCOPE,
      });
      expect(descriptor.name).toBe('myplugin.action');
      expect(descriptor.owner).toEqual({ kind: 'plugin', pluginId: 'myplugin' });
      expect(descriptor.scope).toBe(WRITE_SCOPE);
    });

    it('未提供 scope 时应默认 admin scope', () => {
      const descriptor = createPluginGatewayMethodDescriptor({
        pluginId: 'myplugin',
        name: 'myplugin.action',
        handler: noop,
      });
      expect(descriptor.scope).toBe(ADMIN_SCOPE);
    });

    it('保留命名空间方法（config.*）应被强制为 admin scope', () => {
      const descriptor = createPluginGatewayMethodDescriptor({
        pluginId: 'myplugin',
        name: 'config.something',
        handler: noop,
        scope: READ_SCOPE,
      });
      expect(descriptor.scope).toBe(ADMIN_SCOPE);
    });

    it('exec.approvals.* 应被强制为 admin scope', () => {
      const descriptor = createPluginGatewayMethodDescriptor({
        pluginId: 'myplugin',
        name: 'exec.approvals.custom',
        handler: noop,
        scope: WRITE_SCOPE,
      });
      expect(descriptor.scope).toBe(ADMIN_SCOPE);
    });

    it('非保留命名空间方法应保留声明的 scope', () => {
      const descriptor = createPluginGatewayMethodDescriptor({
        pluginId: 'myplugin',
        name: 'myplugin.readonly',
        handler: noop,
        scope: READ_SCOPE,
      });
      expect(descriptor.scope).toBe(READ_SCOPE);
    });
  });

  describe('createPluginGatewayMethodDescriptors', () => {
    it('有显式 descriptors 时应直接返回', () => {
      const descriptors = createPluginGatewayMethodDescriptors({
        gatewayHandlers: {},
        gatewayMethodDescriptors: [
          {
            name: 'p.method',
            handler: noop,
            scope: WRITE_SCOPE,
            owner: { kind: 'plugin', pluginId: 'p1' },
          },
        ],
      });
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].name).toBe('p.method');
    });

    it('仅 handler map 时应回退到 admin scope', () => {
      const descriptors = createPluginGatewayMethodDescriptors({
        gatewayHandlers: { 'legacy.method': noop },
      });
      expect(descriptors).toHaveLength(1);
      expect(descriptors[0].scope).toBe(ADMIN_SCOPE);
      expect(descriptors[0].owner).toEqual({ kind: 'plugin', pluginId: 'unknown' });
    });
  });
});
