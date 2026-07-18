import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  buildImportUrl,
  isImmutableSource,
  parseImportUrl,
  invalidateImportCache,
  buildImportUrlWithCacheBust,
  hasImportUrlChanged,
} from '../import-url.js';
import type { HookSource } from '../types.js';

describe('import-url', () => {
  let tempDir: string;
  let testFile: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'import-url-test-'));
    testFile = path.join(tempDir, 'handler.ts');
    await fs.promises.writeFile(testFile, 'export default function() {}');
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('isImmutableSource', () => {
    it('should return true for bundled source', () => {
      expect(isImmutableSource('bundled')).toBe(true);
    });

    it('should return false for other sources', () => {
      expect(isImmutableSource('plugin' as HookSource)).toBe(false);
      expect(isImmutableSource('managed' as HookSource)).toBe(false);
      expect(isImmutableSource('workspace' as HookSource)).toBe(false);
    });
  });

  describe('buildImportUrl', () => {
    it('should return base URL for immutable source', () => {
      const url = buildImportUrl(testFile, 'bundled');
      expect(url.startsWith('file://')).toBe(true);
      expect(url).not.toContain('?t=');
      expect(url).not.toContain('&s=');
    });

    it('should include mtime and size for mutable sources', () => {
      const url = buildImportUrl(testFile, 'workspace' as HookSource);
      expect(url).toContain('?t=');
      expect(url).toContain('&s=');
    });

    it('should use timestamp fallback when stat fails', () => {
      const url = buildImportUrl('/nonexistent/path.ts', 'workspace' as HookSource);
      expect(url).toContain('?t=');
    });

    it('should produce valid file URL', () => {
      const url = buildImportUrl(testFile, 'bundled');
      expect(url.startsWith('file://')).toBe(true);
    });
  });

  describe('parseImportUrl', () => {
    it('should parse base path from URL', () => {
      const url = buildImportUrl(testFile, 'bundled');
      const result = parseImportUrl(url);
      expect(result.basePath).toBeDefined();
      expect(result.basePath.length).toBeGreaterThan(0);
    });

    it('should parse mtimeMs and size from mutable source URL', () => {
      const url = buildImportUrl(testFile, 'workspace' as HookSource);
      const result = parseImportUrl(url);
      expect(result.mtimeMs).toBeDefined();
      expect(typeof result.mtimeMs).toBe('number');
      expect(result.size).toBeDefined();
      expect(typeof result.size).toBe('number');
    });

    it('should parse timestamp when no size param', () => {
      const baseUrl = buildImportUrl(testFile, 'bundled');
      const urlWithTimestamp = `${baseUrl}?t=1234567890`;
      const result = parseImportUrl(urlWithTimestamp);
      expect(result.timestamp).toBe(1234567890);
      expect(result.mtimeMs).toBeUndefined();
    });

    it('should handle invalid URL gracefully', () => {
      const result = parseImportUrl('not-a-valid-url');
      expect(result.basePath).toBe('not-a-valid-url');
    });

    it('should return basePath even with no query params', () => {
      const url = buildImportUrl(testFile, 'bundled');
      const result = parseImportUrl(url);
      expect(result.basePath).toBeDefined();
    });

    it('should handle non-numeric t param', () => {
      const baseUrl = buildImportUrl(testFile, 'bundled');
      const url = `${baseUrl}?t=notanumber`;
      const result = parseImportUrl(url);
      expect(result.mtimeMs).toBeUndefined();
      expect(result.timestamp).toBeUndefined();
    });

    it('should handle non-numeric s param', () => {
      const baseUrl = buildImportUrl(testFile, 'bundled');
      const url = `${baseUrl}?t=123&s=notanumber`;
      const result = parseImportUrl(url);
      expect(result.size).toBeUndefined();
    });
  });

  describe('invalidateImportCache', () => {
    it('should not throw when called', () => {
      expect(() => {
        invalidateImportCache(testFile);
      }).not.toThrow();
    });
  });

  describe('buildImportUrlWithCacheBust', () => {
    it('should force cache bust when forceBust is true', () => {
      const url = buildImportUrlWithCacheBust(testFile, 'bundled', true);
      expect(url).toContain('?t=');
    });

    it('should behave like buildImportUrl when forceBust is false', () => {
      const url1 = buildImportUrlWithCacheBust(testFile, 'bundled', false);
      const url2 = buildImportUrl(testFile, 'bundled');
      expect(url1).toBe(url2);
    });

    it('should default forceBust to false', () => {
      const url1 = buildImportUrlWithCacheBust(testFile, 'bundled');
      const url2 = buildImportUrl(testFile, 'bundled');
      expect(url1).toBe(url2);
    });
  });

  describe('hasImportUrlChanged', () => {
    it('should return false when URLs are the same', () => {
      const url = buildImportUrl(testFile, 'workspace' as HookSource);
      expect(hasImportUrlChanged(url, testFile, 'workspace' as HookSource)).toBe(false);
    });

    it('should return true when file is modified', async () => {
      const originalUrl = buildImportUrl(testFile, 'workspace' as HookSource);
      
      await new Promise((resolve) => setTimeout(resolve, 100));
      await fs.promises.writeFile(testFile, 'updated content');
      
      expect(hasImportUrlChanged(originalUrl, testFile, 'workspace' as HookSource)).toBe(true);
    });

    it('should return false for immutable source even if file changes', async () => {
      const originalUrl = buildImportUrl(testFile, 'bundled');
      
      await fs.promises.writeFile(testFile, 'updated content');
      
      expect(hasImportUrlChanged(originalUrl, testFile, 'bundled')).toBe(false);
    });
  });
});
