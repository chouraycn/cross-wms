import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { createTempDir, withTempDir } from '../temp-dir';

describe('Temp Dir 测试', () => {
  describe('createTempDir', () => {
    it('应该创建临时目录', () => {
      const { dir, cleanup } = createTempDir();
      const path = dir.getPath();

      expect(fs.existsSync(path)).toBe(true);
      expect(fs.statSync(path).isDirectory()).toBe(true);

      cleanup();
    });

    it('应该支持自定义前缀', () => {
      const { dir, cleanup } = createTempDir({ prefix: 'custom-prefix-' });
      const path = dir.getPath();

      expect(path).toContain('custom-prefix-');

      cleanup();
    });

    it('应该支持自定义后缀', () => {
      const { dir, cleanup } = createTempDir({ suffix: '-suffix' });
      const path = dir.getPath();

      expect(path.endsWith('-suffix')).toBe(true);

      cleanup();
    });

    it('应该自动清理目录', () => {
      const { dir, cleanup } = createTempDir();
      const path = dir.getPath();

      expect(fs.existsSync(path)).toBe(true);

      cleanup();

      expect(fs.existsSync(path)).toBe(false);
    });

    it('应该支持禁用自动清理', () => {
      const { dir, cleanup } = createTempDir({ cleanup: false });
      const path = dir.getPath();

      cleanup();

      expect(fs.existsSync(path)).toBe(true);

      fs.rmSync(path, { recursive: true, force: true });
    });
  });

  describe('TempDir 方法', () => {
    it('should have join method', () => {
      const { dir, cleanup } = createTempDir();

      const joined = dir.join('subdir', 'file.txt');
      expect(joined).toContain(dir.getPath());
      expect(joined.endsWith('subdir/file.txt')).toBe(true);

      cleanup();
    });

    it('should have createFile method', () => {
      const { dir, cleanup } = createTempDir();

      const filePath = dir.createFile('test.txt', 'test content');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('test content');

      cleanup();
    });

    it('should have createJsonFile method', () => {
      const { dir, cleanup } = createTempDir();

      const data = { key: 'value', number: 123 };
      const filePath = dir.createJsonFile('test.json', data);

      expect(fs.existsSync(filePath)).toBe(true);
      const readData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(readData).toEqual(data);

      cleanup();
    });

    it('should have createDir method', () => {
      const { dir, cleanup } = createTempDir();

      const dirPath = dir.createDir('subdir/nested');
      expect(fs.existsSync(dirPath)).toBe(true);
      expect(fs.statSync(dirPath).isDirectory()).toBe(true);

      cleanup();
    });

    it('should have readFile method', () => {
      const { dir, cleanup } = createTempDir();

      dir.createFile('test.txt', 'test content');
      const content = dir.readFile('test.txt');

      expect(content).toBe('test content');

      cleanup();
    });

    it('should have readJsonFile method', () => {
      const { dir, cleanup } = createTempDir();

      const data = { key: 'value' };
      dir.createJsonFile('test.json', data);
      const readData = dir.readJsonFile('test.json');

      expect(readData).toEqual(data);

      cleanup();
    });

    it('should have exists method', () => {
      const { dir, cleanup } = createTempDir();

      expect(dir.exists('nonexistent')).toBe(false);
      dir.createFile('existing.txt', 'content');
      expect(dir.exists('existing.txt')).toBe(true);

      cleanup();
    });
  });

  describe('withTempDir', () => {
    it('should provide temp dir to callback', async () => {
      await withTempDir((dir) => {
        expect(dir.getPath()).toBeDefined();
        expect(fs.existsSync(dir.getPath())).toBe(true);
      });
    });

    it('should clean up after callback', async () => {
      let path: string;
      await withTempDir((dir) => {
        path = dir.getPath();
        expect(fs.existsSync(path)).toBe(true);
      });

      expect(fs.existsSync(path!)).toBe(false);
    });

    it('should support async callback', async () => {
      await withTempDir(async (dir) => {
        dir.createFile('async.txt', 'async content');
        await new Promise(resolve => setTimeout(resolve, 10));
        expect(dir.readFile('async.txt')).toBe('async content');
      });
    });
  });
});