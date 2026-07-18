import { describe, it, expect } from 'vitest';
import type {
  PluginManifest,
  PluginInstance,
  PluginContext,
  PluginLifecycle,
  PluginRuntimeRecord,
  PluginHealthMetrics,
  MarketplaceEntry,
  PluginContractResult,
  PluginConfigSchema,
  PluginDependency,
  PluginEvent,
  PluginCapabilityKind,
} from '../types.js';

describe('plugins/types (类型契约)', () => {
  it('PluginManifest 接受完整对象', () => {
    const manifest: PluginManifest = {
      id: 'demo',
      name: 'Demo',
      version: '1.0.0',
      apiVersion: '1.0.0',
      capabilities: ['tool'],
      permissions: ['network'],
      dependencies: [{ id: 'dep1', versionRange: '^1.0.0' }],
      configSchema: {
        type: 'object',
        properties: { apiKey: { type: 'string' } },
        required: ['apiKey'],
      },
    };
    expect(manifest.id).toBe('demo');
  });

  it('PluginInstance 包含必要字段', () => {
    const inst: PluginInstance = {
      id: 'p1',
      manifest: { id: 'p1', name: 'P1', version: '1.0.0' },
      loadedAt: Date.now(),
      status: 'installed',
      capabilities: [],
    };
    expect(inst.status).toBe('installed');
  });

  it('PluginContext 字段对齐', () => {
    const ctx: PluginContext = {
      pluginId: 'p1',
      manifest: { id: 'p1', name: 'P1', version: '1.0.0' },
      logger: { debug() {}, info() {}, warn() {}, error() {} },
      storage: {
        get: async () => undefined,
        set: async () => {},
        delete: async () => {},
        keys: async () => [],
      },
      fetch: async () => ({ ok: true, status: 200, statusText: 'OK', headers: {}, text: async () => '', json: async () => ({}) }),
      eventBus: { emit() {}, on: () => () => {}, off() {} },
      config: { get: () => undefined, getAll: () => ({}) },
      hasPermission: () => false,
    };
    expect(ctx.pluginId).toBe('p1');
  });

  it('PluginLifecycle 接口可选实现', () => {
    const lifecycle: PluginLifecycle = {
      install: async () => {},
      enable: async () => {},
      disable: async () => {},
      uninstall: async () => {},
      update: async () => {},
    };
    expect(typeof lifecycle.install).toBe('function');
  });

  it('PluginRuntimeRecord 字段齐全', () => {
    const rec: PluginRuntimeRecord = {
      pluginId: 'p1',
      version: '1.0.0',
      source: 'local',
      status: 'enabled',
      loadState: 'active',
      capabilities: ['tool'],
      dependencies: [],
      enabledAt: Date.now(),
    };
    expect(rec.loadState).toBe('active');
  });

  it('PluginHealthMetrics 字段齐全', () => {
    const metric: PluginHealthMetrics = {
      pluginId: 'p1',
      healthy: true,
      errorCount: 0,
      lastCheckAt: Date.now(),
      uptimeMs: 1000,
    };
    expect(metric.healthy).toBe(true);
  });

  it('MarketplaceEntry 字段齐全', () => {
    const entry: MarketplaceEntry = {
      id: 'p1',
      name: 'P1',
      description: 'd',
      version: '1.0.0',
      author: 'a',
      downloads: 0,
      rating: 5,
      ratingCount: 1,
      categories: [],
      publishedAt: 0,
      updatedAt: 0,
    };
    expect(entry.id).toBe('p1');
  });

  it('PluginContractResult 字段齐全', () => {
    const result: PluginContractResult = {
      compatible: true,
      reasons: [],
      hostApiVersion: '1.0.0',
      pluginApiVersion: '1.0.0',
    };
    expect(result.compatible).toBe(true);
  });

  it('PluginDependency 包含 optional', () => {
    const dep: PluginDependency = {
      id: 'dep1',
      versionRange: '^1.0.0',
      optional: true,
    };
    expect(dep.optional).toBe(true);
  });

  it('PluginEvent 类型支持多种事件', () => {
    const events: PluginEvent[] = [
      { type: 'load', pluginId: 'p1', timestamp: 0 },
      { type: 'activate', pluginId: 'p1', timestamp: 0 },
      { type: 'deactivate', pluginId: 'p1', timestamp: 0 },
      { type: 'error', pluginId: 'p1', timestamp: 0, payload: 'err' },
      { type: 'uninstall', pluginId: 'p1', timestamp: 0 },
      { type: 'update', pluginId: 'p1', timestamp: 0 },
    ];
    expect(events.length).toBe(6);
  });

  it('PluginCapabilityKind 包含 8 种能力', () => {
    const kinds: PluginCapabilityKind[] = [
      'tool',
      'hook',
      'command',
      'channel',
      'provider',
      'memory-host',
      'embedding',
      'service',
    ];
    expect(kinds.length).toBe(8);
  });

  it('PluginConfigSchema 嵌套结构', () => {
    const schema: PluginConfigSchema = {
      type: 'object',
      properties: {
        nested: {
          type: 'object',
          properties: {
            inner: { type: 'string' },
          },
          required: ['inner'],
        },
      },
    };
    expect(schema.properties?.nested.properties?.inner.type).toBe('string');
  });
});
