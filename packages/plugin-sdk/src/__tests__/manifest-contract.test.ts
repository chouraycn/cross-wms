/**
 * Plugin Manifest Contract 测试
 *
 * 覆盖 ManifestValidator 和 validateManifest 的契约行为：
 * - 必填字段校验（id, name, version, entry）
 * - ID 格式（仅小写字母数字中划线）
 * - 版本格式（semver）
 * - kind 校验（8 种允许类型）
 * - declaredCapabilities 校验
 * - requiresPlugins 必须为数组
 * - 默认值与 normalize
 * - 加载、比较、发现
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  ManifestValidator,
  validateManifest,
  normalizeManifest,
  loadManifestFromPath,
  discoverPlugins,
  compareManifests,
} from '../manifest.js';
import type { PluginManifest } from '../types.js';

const validManifest: PluginManifest = {
  id: 'test-plugin',
  name: 'Test Plugin',
  version: '1.0.0',
  entry: 'index.js',
  description: 'A test plugin',
};

describe('Plugin Manifest Contract', () => {
  describe('validateManifest - 必填字段', () => {
    it('缺少 id 时返回错误', () => {
      const result = validateManifest({ name: 'x', version: '1.0.0', entry: 'index.js' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('id'))).toBe(true);
    });

    it('缺少 name 时返回错误', () => {
      const result = validateManifest({ id: 'x', version: '1.0.0', entry: 'index.js' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('name'))).toBe(true);
    });

    it('缺少 version 时返回错误', () => {
      const result = validateManifest({ id: 'x', name: 'y', entry: 'index.js' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('缺少 entry 时返回错误', () => {
      const result = validateManifest({ id: 'x', name: 'y', version: '1.0.0' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('entry'))).toBe(true);
    });

    it('提供全部必填字段时校验通过', () => {
      const result = validateManifest(validManifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('validateManifest - ID 格式', () => {
    it('大写字母的 id 应该失败', () => {
      const result = validateManifest({ ...validManifest, id: 'InvalidId' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid plugin id'))).toBe(true);
    });

    it('带下划线的 id 应该失败', () => {
      const result = validateManifest({ ...validManifest, id: 'invalid_id' });
      expect(result.valid).toBe(false);
    });

    it('带空格的 id 应该失败', () => {
      const result = validateManifest({ ...validManifest, id: 'invalid id' });
      expect(result.valid).toBe(false);
    });

    it('空 id 应该失败', () => {
      const result = validateManifest({ ...validManifest, id: '' });
      expect(result.valid).toBe(false);
    });

    it('小写字母+数字+中划线应该通过', () => {
      const result = validateManifest({ ...validManifest, id: 'valid-plugin-123' });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateManifest - 版本格式', () => {
    it('非 semver 格式应该失败', () => {
      const result = validateManifest({ ...validManifest, version: 'v1.0' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('version'))).toBe(true);
    });

    it('带 pre-release tag 的 semver 应该通过', () => {
      const result = validateManifest({ ...validManifest, version: '1.0.0-beta' });
      expect(result.valid).toBe(true);
    });

    it('4 段版本号应该失败', () => {
      const result = validateManifest({ ...validManifest, version: '1.0.0.0' });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateManifest - kind 校验', () => {
    it('单种 kind（字符串）应该通过', () => {
      const result = validateManifest({ ...validManifest, kind: 'tool' });
      expect(result.valid).toBe(true);
    });

    it('多种 kind（数组）应该通过', () => {
      const result = validateManifest({ ...validManifest, kind: ['tool', 'hook'] });
      expect(result.valid).toBe(true);
    });

    it('无效的 kind 应该失败', () => {
      const result = validateManifest({ ...validManifest, kind: 'unknown-kind' });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid kind'))).toBe(true);
    });

    it('部分无效的 kind 数组应该失败', () => {
      const result = validateManifest({ ...validManifest, kind: ['tool', 'invalid'] });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateManifest - declaredCapabilities 校验', () => {
    it('合法的 capability 列表应该通过', () => {
      const result = validateManifest({
        ...validManifest,
        declaredCapabilities: ['tool', 'provider', 'channel'],
      });
      expect(result.valid).toBe(true);
    });

    it('非法 capability 应该失败', () => {
      const result = validateManifest({
        ...validManifest,
        declaredCapabilities: ['tool', 'invalid-cap'],
      });
      expect(result.valid).toBe(false);
    });
  });

  describe('validateManifest - requiresPlugins 校验', () => {
    it('requiresPlugins 为数组应该通过', () => {
      const result = validateManifest({
        ...validManifest,
        requiresPlugins: ['other-plugin'],
      });
      expect(result.valid).toBe(true);
    });

    it('requiresPlugins 为字符串应该失败', () => {
      const result = validateManifest({
        ...validManifest,
        requiresPlugins: 'not-array' as unknown as string[],
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('requiresPlugins'))).toBe(true);
    });
  });

  describe('validateManifest - 输入类型校验', () => {
    it('null 输入应该失败', () => {
      const result = validateManifest(null);
      expect(result.valid).toBe(false);
    });

    it('undefined 输入应该失败', () => {
      const result = validateManifest(undefined);
      expect(result.valid).toBe(false);
    });

    it('数组输入应该失败', () => {
      const result = validateManifest([]);
      expect(result.valid).toBe(false);
    });

    it('字符串输入应该失败', () => {
      const result = validateManifest('not an object');
      expect(result.valid).toBe(false);
    });
  });

  describe('validateManifest - 警告', () => {
    it('entry 不是 .js/.ts 时产生警告', () => {
      const result = validateManifest({ ...validManifest, entry: 'index.mjs' });
      expect(result.warnings.some((w) => w.includes('Entry file'))).toBe(true);
    });

    it('requiresSetup 为 true 但未指定 setupEntry 时产生警告', () => {
      const result = validateManifest({
        ...validManifest,
        activation: { requiresSetup: true },
      });
      expect(result.warnings.some((w) => w.includes('setupEntry'))).toBe(true);
    });

    it('activation 完整配置不产生警告', () => {
      const result = validateManifest({
        ...validManifest,
        activation: { requiresSetup: true, setupEntry: 'setup.js' },
      });
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('normalizeManifest - 默认值', () => {
    it('缺失字段填充默认值', () => {
      const result = normalizeManifest({
        id: 'p',
        name: 'n',
        version: '1.0.0',
        entry: 'index.js',
      });
      expect(result.description).toBe('');
      expect(result.author).toBe('');
      expect(result.kind).toEqual(['service']);
      expect(result.channels).toEqual([]);
      expect(result.providers).toEqual([]);
      expect(result.requiresPlugins).toEqual([]);
      expect(result.enabledByDefault).toBe(true);
      expect(result.license).toBe('MIT');
      expect(result.minAppVersion).toBe('1.0.0');
      expect(result.sdkVersion).toBe('1.0.0');
      expect(result.declaredCapabilities).toEqual([]);
    });
  });

  describe('loadManifestFromPath', () => {
    let tmpDir: string;

    it('从有效文件加载并校验通过', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
      const filePath = path.join(tmpDir, 'plugin.json');
      fs.writeFileSync(filePath, JSON.stringify(validManifest));
      const result = loadManifestFromPath(filePath);
      expect(result.valid).toBe(true);
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('文件不存在时返回错误', () => {
      const result = loadManifestFromPath('/nonexistent/path/plugin.json');
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Failed to load');
    });

    it('JSON 解析失败时返回错误', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'));
      const filePath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(filePath, '{ invalid json');
      const result = loadManifestFromPath(filePath);
      expect(result.valid).toBe(false);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('compareManifests', () => {
    it('相同 manifest 标记为未变化', () => {
      const result = compareManifests(validManifest, { ...validManifest });
      expect(result.changed).toBe(false);
      expect(result.diffs).toHaveLength(0);
    });

    it('id 变化标记为变化', () => {
      const result = compareManifests(validManifest, { ...validManifest, id: 'new-id' });
      expect(result.changed).toBe(true);
      expect(result.diffs.some((d) => d.startsWith('id:'))).toBe(true);
    });

    it('version 变化标记为变化', () => {
      const result = compareManifests(validManifest, { ...validManifest, version: '2.0.0' });
      expect(result.changed).toBe(true);
      expect(result.diffs.some((d) => d.startsWith('version:'))).toBe(true);
    });

    it('kind 数组变化标记为变化', () => {
      const result = compareManifests(
        { ...validManifest, kind: ['tool'] },
        { ...validManifest, kind: ['tool', 'hook'] },
      );
      expect(result.changed).toBe(true);
    });
  });

  describe('discoverPlugins', () => {
    it('从目录中发现有效插件', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));
      const pluginDir = path.join(tmpDir, 'my-plugin');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(validManifest));
      const manifests = discoverPlugins([tmpDir]);
      expect(manifests.length).toBe(1);
      expect(manifests[0].id).toBe('test-plugin');
      fs.rmSync(tmpDir, { recursive: true });
    });

    it('不存在的目录返回空数组', () => {
      const manifests = discoverPlugins(['/nonexistent/dir']);
      expect(manifests).toEqual([]);
    });

    it('无效的 manifest 不会出现在结果中', () => {
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'discover-test-'));
      const pluginDir = path.join(tmpDir, 'bad-plugin');
      fs.mkdirSync(pluginDir);
      fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify({ invalid: true }));
      const manifests = discoverPlugins([tmpDir]);
      expect(manifests).toEqual([]);
      fs.rmSync(tmpDir, { recursive: true });
    });
  });

  describe('ManifestValidator (class API)', () => {
    it('validate 静态方法与函数行为一致', () => {
      const result = ManifestValidator.validate(validManifest);
      expect(result.valid).toBe(true);
    });

    it('normalize 静态方法与函数行为一致', () => {
      const result = ManifestValidator.normalize({
        id: 'p',
        name: 'n',
        version: '1.0.0',
        entry: 'index.js',
      });
      expect(result.license).toBe('MIT');
    });

    it('loadFromPath 静态方法与函数行为一致', () => {
      const result = ManifestValidator.loadFromPath('/nonexistent.json');
      expect(result.valid).toBe(false);
    });

    it('compare 静态方法与函数行为一致', () => {
      const result = ManifestValidator.compare(validManifest, { ...validManifest });
      expect(result.changed).toBe(false);
    });
  });
});
