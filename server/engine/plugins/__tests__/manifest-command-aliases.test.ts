import { describe, it, expect } from 'vitest';
import {
  normalizeManifestCommandAliases,
  resolveManifestToolOwnerInRegistry,
  resolveManifestCommandAliasOwnerInRegistry,
} from '../manifest-command-aliases.js';
import type { PluginManifestCommandAliasRegistry } from '../manifest-command-aliases.js';

describe('plugins/manifest-command-aliases (纯函数)', () => {
  describe('normalizeManifestCommandAliases', () => {
    it('非数组返回 undefined', () => {
      expect(normalizeManifestCommandAliases(undefined)).toBeUndefined();
      expect(normalizeManifestCommandAliases(null)).toBeUndefined();
      expect(normalizeManifestCommandAliases({})).toBeUndefined();
      expect(normalizeManifestCommandAliases('foo')).toBeUndefined();
    });

    it('空数组返回 undefined', () => {
      expect(normalizeManifestCommandAliases([])).toBeUndefined();
    });

    it('字符串数组转换为 { name } 对象数组', () => {
      const result = normalizeManifestCommandAliases(['foo', 'bar']);
      expect(result).toEqual([{ name: 'foo' }, { name: 'bar' }]);
    });

    it('空字符串被过滤', () => {
      const result = normalizeManifestCommandAliases(['', 'foo', '   ']);
      expect(result).toEqual([{ name: 'foo' }]);
    });

    it('对象数组保留 name 字段', () => {
      const result = normalizeManifestCommandAliases([{ name: 'foo' }, { name: 'bar' }]);
      expect(result).toEqual([{ name: 'foo' }, { name: 'bar' }]);
    });

    it('对象缺少 name 字段被过滤', () => {
      const result = normalizeManifestCommandAliases([
        { kind: 'runtime-slash' },
        { name: 'foo' },
      ]);
      expect(result).toEqual([{ name: 'foo' }]);
    });

    it('kind 为 runtime-slash 时保留', () => {
      const result = normalizeManifestCommandAliases([
        { name: 'foo', kind: 'runtime-slash' },
      ]);
      expect(result).toEqual([{ name: 'foo', kind: 'runtime-slash' }]);
    });

    it('kind 非 runtime-slash 时丢弃 kind 字段', () => {
      const result = normalizeManifestCommandAliases([
        { name: 'foo', kind: 'invalid' },
      ] as never);
      expect(result).toEqual([{ name: 'foo' }]);
    });

    it('cliCommand 非空时保留', () => {
      const result = normalizeManifestCommandAliases([
        { name: 'foo', cliCommand: 'foo-cli' },
      ]);
      expect(result).toEqual([{ name: 'foo', cliCommand: 'foo-cli' }]);
    });

    it('cliCommand 为空字符串时丢弃', () => {
      const result = normalizeManifestCommandAliases([
        { name: 'foo', cliCommand: '' },
      ]);
      expect(result).toEqual([{ name: 'foo' }]);
    });

    it('混合字符串和对象输入', () => {
      const result = normalizeManifestCommandAliases([
        'plain',
        { name: 'obj', kind: 'runtime-slash', cliCommand: 'cli' },
        42,
        null,
        { noName: true },
        '',
      ]);
      expect(result).toEqual([
        { name: 'plain' },
        { name: 'obj', kind: 'runtime-slash', cliCommand: 'cli' },
      ]);
    });

    it('非记录类型条目被过滤', () => {
      const result = normalizeManifestCommandAliases([42, true, null, 'valid']);
      expect(result).toEqual([{ name: 'valid' }]);
    });
  });

  describe('resolveManifestToolOwnerInRegistry', () => {
    function makeRegistry(plugins: PluginManifestCommandAliasRegistry['plugins']): PluginManifestCommandAliasRegistry {
      return { plugins };
    }

    it('toolName 为空返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['tool-a'] } },
      ]);
      expect(resolveManifestToolOwnerInRegistry({ toolName: '', registry })).toBeUndefined();
    });

    it('toolName 为 undefined 返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['tool-a'] } },
      ]);
      expect(
        resolveManifestToolOwnerInRegistry({ toolName: undefined, registry }),
      ).toBeUndefined();
    });

    it('匹配到 tool 时返回 pluginId', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['tool-a'] } },
      ]);
      const result = resolveManifestToolOwnerInRegistry({ toolName: 'tool-a', registry });
      expect(result).toEqual({ toolName: 'tool-a', pluginId: 'p1' });
    });

    it('大小写不敏感匹配', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['ToolA'] } },
      ]);
      const result = resolveManifestToolOwnerInRegistry({ toolName: 'toola', registry });
      expect(result).toEqual({ toolName: 'ToolA', pluginId: 'p1' });
    });

    it('未匹配返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['tool-a'] } },
      ]);
      expect(
        resolveManifestToolOwnerInRegistry({ toolName: 'tool-b', registry }),
      ).toBeUndefined();
    });

    it('插件无 contracts.tools 时跳过', () => {
      const registry = makeRegistry([
        { id: 'p1' },
        { id: 'p2', contracts: { tools: [] } },
        { id: 'p3', contracts: {} },
      ]);
      expect(
        resolveManifestToolOwnerInRegistry({ toolName: 'any', registry }),
      ).toBeUndefined();
    });

    it('多个插件时返回首个匹配', () => {
      const registry = makeRegistry([
        { id: 'p1', contracts: { tools: ['shared'] } },
        { id: 'p2', contracts: { tools: ['shared'] } },
      ]);
      const result = resolveManifestToolOwnerInRegistry({ toolName: 'shared', registry });
      expect(result?.pluginId).toBe('p1');
    });

    it('空注册表返回 undefined', () => {
      const registry = makeRegistry([]);
      expect(
        resolveManifestToolOwnerInRegistry({ toolName: 'tool', registry }),
      ).toBeUndefined();
    });
  });

  describe('resolveManifestCommandAliasOwnerInRegistry', () => {
    function makeRegistry(plugins: PluginManifestCommandAliasRegistry['plugins']): PluginManifestCommandAliasRegistry {
      return { plugins };
    }

    it('command 为空返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'foo' }] },
      ]);
      expect(
        resolveManifestCommandAliasOwnerInRegistry({ command: '', registry }),
      ).toBeUndefined();
    });

    it('command 为 undefined 返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'foo' }] },
      ]);
      expect(
        resolveManifestCommandAliasOwnerInRegistry({ command: undefined, registry }),
      ).toBeUndefined();
    });

    it('匹配到 alias 时返回 pluginId', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'foo' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry });
      expect(result).toEqual({ name: 'foo', pluginId: 'p1' });
    });

    it('大小写不敏感匹配', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'Foo' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'FOO', registry });
      expect(result).toEqual({ name: 'Foo', pluginId: 'p1' });
    });

    it('未匹配返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'foo' }] },
      ]);
      expect(
        resolveManifestCommandAliasOwnerInRegistry({ command: 'bar', registry }),
      ).toBeUndefined();
    });

    it('enabledByDefault=true 时透传', () => {
      const registry = makeRegistry([
        { id: 'p1', enabledByDefault: true, commandAliases: [{ name: 'foo' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry });
      expect(result?.enabledByDefault).toBe(true);
    });

    it('enabledByDefault 缺省时不包含字段', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'foo' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry });
      expect(result).not.toHaveProperty('enabledByDefault');
    });

    it('command 等于某个 pluginId 时优先返回该 plugin 自身的 alias', () => {
      // 当 alias 名称恰好等于另一个插件的 id 时，
      // resolveManifestCommandAliasOwnerInRegistry 会跳过非匹配 plugin，
      // 仅返回 id 与 command 相同的 plugin 的 alias。
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'p2' }] },
        { id: 'p2', commandAliases: [{ name: 'p2' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'p2', registry });
      expect(result?.pluginId).toBe('p2');
    });

    it('command 是 pluginId 但该 plugin 无匹配 alias 时返回 undefined', () => {
      const registry = makeRegistry([
        { id: 'p1', commandAliases: [{ name: 'p2' }] },
        { id: 'p2', commandAliases: [{ name: 'other' }] },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'p2', registry });
      expect(result).toBeUndefined();
    });

    it('插件无 commandAliases 时跳过', () => {
      const registry = makeRegistry([
        { id: 'p1' },
        { id: 'p2', commandAliases: [] },
      ]);
      expect(
        resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry }),
      ).toBeUndefined();
    });

    it('保留 alias 上的额外字段（kind/cliCommand）', () => {
      const registry = makeRegistry([
        {
          id: 'p1',
          commandAliases: [{ name: 'foo', kind: 'runtime-slash', cliCommand: 'foo-cli' }],
        },
      ]);
      const result = resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry });
      expect(result).toEqual({
        name: 'foo',
        kind: 'runtime-slash',
        cliCommand: 'foo-cli',
        pluginId: 'p1',
      });
    });

    it('空注册表返回 undefined', () => {
      const registry = makeRegistry([]);
      expect(
        resolveManifestCommandAliasOwnerInRegistry({ command: 'foo', registry }),
      ).toBeUndefined();
    });
  });
});
