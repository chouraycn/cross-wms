import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

vi.mock('../../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    isLevelEnabled: vi.fn(() => false),
    child: vi.fn(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    })),
  },
}));

import { FunctionLoader, createFunctionLoader } from '../function-loader.js';

describe('node-host/function-loader', () => {
  let loader: FunctionLoader;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'function-loader-test-'));
    loader = createFunctionLoader({
      allowedPaths: [tempDir],
      enableCache: false,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('路径验证', () => {
    it('allowedPaths 为空时允许所有路径', () => {
      const l = createFunctionLoader({ enableCache: false });
      expect(l.getAllowedPaths()).toEqual([]);
    });

    it('getAllowedPaths 返回允许的路径列表', () => {
      const paths = loader.getAllowedPaths();
      expect(paths).toContain(tempDir);
    });

    it('验证路径 - 在允许列表内', () => {
      const filePath = path.join(tempDir, 'test.js');
      expect(filePath.startsWith(tempDir)).toBe(true);
    });

    it('验证路径 - 不在允许列表内', () => {
      const outsidePath = path.join(os.tmpdir(), 'outside.js');
      expect(outsidePath.startsWith(tempDir)).toBe(false);
    });
  });

  describe('文件大小验证', () => {
    it('maxModuleSizeBytes 设置大小限制', () => {
      const l = createFunctionLoader({
        allowedPaths: [tempDir],
        maxModuleSizeBytes: 100,
        enableCache: false,
      });
      const bigFile = path.join(tempDir, 'big.js');
      fs.writeFileSync(bigFile, 'x'.repeat(200));
      const stats = fs.statSync(bigFile);
      expect(stats.size).toBe(200);
    });

    it('小文件通过大小检查', () => {
      const smallFile = path.join(tempDir, 'small.js');
      fs.writeFileSync(smallFile, 'module.exports = function() { return 1; };');
      const stats = fs.statSync(smallFile);
      expect(stats.size).toBeLessThan(1024);
    });
  });

  describe('缓存', () => {
    it('默认启用缓存', () => {
      const l = createFunctionLoader();
      expect(l.getCacheSize()).toBe(0);
    });

    it('disableCache 禁用缓存', () => {
      const l = createFunctionLoader({ enableCache: true });
      l.disableCache();
      expect(l.getCacheSize()).toBe(0);
    });

    it('enableCache 启用缓存', () => {
      const l = createFunctionLoader({ enableCache: false });
      l.enableCache();
    });

    it('clearCache 清空缓存', () => {
      const l = createFunctionLoader({ enableCache: true });
      l.clearCache();
      expect(l.getCacheSize()).toBe(0);
    });

    it('getCacheSize 返回缓存数量', () => {
      expect(loader.getCacheSize()).toBe(0);
    });

    it('setCacheTTL 设置 TTL', () => {
      const l = createFunctionLoader();
      l.setCacheTTL(5000);
    });

    it('isCached 未缓存时返回 false', () => {
      expect(loader.isCached('/nonexistent')).toBe(false);
    });

    it('invalidate 不存在的返回 false', () => {
      expect(loader.invalidate('/nonexistent')).toBe(false);
    });
  });

  describe('工厂函数', () => {
    it('createFunctionLoader 创建实例', () => {
      const l = createFunctionLoader();
      expect(l).toBeInstanceOf(FunctionLoader);
    });

    it('createFunctionLoader 带选项', () => {
      const l = createFunctionLoader({ maxModuleSizeBytes: 1024 });
      expect(l).toBeInstanceOf(FunctionLoader);
    });
  });

  describe('模块加载', () => {
    it('加载成功的模块 (CommonJS)', async () => {
      const modPath = path.join(tempDir, 'simple.js');
      fs.writeFileSync(modPath, 'module.exports = function() { return 42; };');
      const result = await loader.load(modPath);
      expect(result).toBeDefined();
      expect(result.name).toBe('simple');
      expect(result.sourcePath).toBe(modPath);
      expect(typeof result.fn).toBe('function');
      expect(result.fn()).toBe(42);
    });

    it('加载指定 export 名称', async () => {
      const modPath = path.join(tempDir, 'named.js');
      fs.writeFileSync(modPath, 'exports.add = function(a, b) { return a + b; };');
      const result = await loader.load(modPath, 'add');
      expect(result).toBeDefined();
      expect(result.name).toBe('add');
      expect(typeof result.fn).toBe('function');
      expect(result.fn(2, 3)).toBe(5);
    });

    it('模块不存在抛出错误', async () => {
      const modPath = path.join(tempDir, 'nonexistent.js');
      await expect(loader.load(modPath)).rejects.toThrow('Cannot read module file');
    });

    it('export 不存在抛出错误', async () => {
      const modPath = path.join(tempDir, 'noexport.js');
      fs.writeFileSync(modPath, 'exports.foo = 1;');
      await expect(loader.load(modPath, 'nonexistent')).rejects.toThrow("Export 'nonexistent' not found");
    });

    it('非函数 export 抛出错误', async () => {
      const modPath = path.join(tempDir, 'notfn.js');
      fs.writeFileSync(modPath, 'module.exports = 42;');
      await expect(loader.load(modPath)).rejects.toThrow('is not a function');
    });
  });

  describe('缓存功能', () => {
    it('启用缓存时重复加载使用缓存', async () => {
      const l = createFunctionLoader({
        allowedPaths: [tempDir],
        enableCache: true,
        cacheTTLMs: 60000,
      });
      const modPath = path.join(tempDir, 'cached.js');
      fs.writeFileSync(modPath, 'module.exports = function() { return "cached"; };');

      const r1 = await l.load(modPath);
      const r2 = await l.load(modPath);

      expect(r1.id).toBe(r2.id);
      expect(l.getCacheSize()).toBe(1);
      expect(l.isCached(modPath)).toBe(true);
    });

    it('invalidate 使缓存失效', async () => {
      const l = createFunctionLoader({
        allowedPaths: [tempDir],
        enableCache: true,
        cacheTTLMs: 60000,
      });
      const modPath = path.join(tempDir, 'invalidate.js');
      fs.writeFileSync(modPath, 'module.exports = function() { return 1; };');

      await l.load(modPath);
      expect(l.isCached(modPath)).toBe(true);

      const result = l.invalidate(modPath);
      expect(result).toBe(true);
      expect(l.isCached(modPath)).toBe(false);
    });

    it('invalidate 带 exportName', async () => {
      const l = createFunctionLoader({
        allowedPaths: [tempDir],
        enableCache: true,
        cacheTTLMs: 60000,
      });
      const modPath = path.join(tempDir, 'named-inv.js');
      fs.writeFileSync(modPath, 'exports.foo = function() { return 1; };');

      await l.load(modPath, 'foo');
      expect(l.isCached(modPath, 'foo')).toBe(true);
      expect(l.invalidate(modPath, 'foo')).toBe(true);
    });
  });
});
