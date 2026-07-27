/**
 * Desktop Helpers 单元测试
 *
 * 覆盖：
 * - escapeForAppleScript
 * - BROWSER_APPS 检测
 * - DesktopElement 缓存操作
 * - setDesktopSnapshotCache / desktopSnapshotCache
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  escapeForAppleScript,
  BROWSER_APPS,
  setDesktopSnapshotCache,
  desktopSnapshotCache,
  isMac,
  isLinux,
  PLATFORM,
} from '../helpers.js';
import type { DesktopElement } from '../helpers.js';

describe('Desktop Helpers — 辅助函数', () => {
  beforeEach(() => {
    setDesktopSnapshotCache(null);
  });

  // 1
  describe('escapeForAppleScript', () => {
    it('应转义反斜杠', () => {
      expect(escapeForAppleScript('path\\to\\file')).toBe('path\\\\to\\\\file');
    });

    // 2
    it('应转义双引号', () => {
      expect(escapeForAppleScript('say "hello"')).toBe('say \\"hello\\"');
    });

    // 3
    it('应转义单引号', () => {
      expect(escapeForAppleScript("it's")).toBe("it\\'s");
    });

    // 4
    it('应同时转义多种特殊字符', () => {
      const input = `He said: "It's a \\test"`;
      const result = escapeForAppleScript(input);
      expect(result).toContain('\\"');
      expect(result).toContain("\\'");
      expect(result).toContain('\\\\');
    });

    // 5
    it('普通文本应保持不变', () => {
      expect(escapeForAppleScript('hello world')).toBe('hello world');
      expect(escapeForAppleScript('')).toBe('');
    });
  });

  // 6
  describe('BROWSER_APPS', () => {
    it('应包含常见浏览器', () => {
      expect(BROWSER_APPS.has('safari')).toBe(true);
      expect(BROWSER_APPS.has('chrome')).toBe(true);
      expect(BROWSER_APPS.has('google chrome')).toBe(true);
      expect(BROWSER_APPS.has('firefox')).toBe(true);
      expect(BROWSER_APPS.has('edge')).toBe(true);
      expect(BROWSER_APPS.has('brave')).toBe(true);
      expect(BROWSER_APPS.has('arc')).toBe(true);
    });

    // 7
    it('应不包含非浏览器应用', () => {
      expect(BROWSER_APPS.has('finder')).toBe(false);
      expect(BROWSER_APPS.has('terminal')).toBe(false);
      expect(BROWSER_APPS.has('xcode')).toBe(false);
    });
  });

  // 8
  describe('desktopSnapshotCache', () => {
    it('初始应为 null', () => {
      expect(desktopSnapshotCache).toBeNull();
    });

    // 9
    it('setDesktopSnapshotCache 应设置缓存', () => {
      const cache = new Map<string, DesktopElement>();
      const elem: DesktopElement = {
        ref: 'btn-1',
        role: 'button',
        name: 'OK',
        bounds: { x: 100, y: 200, w: 80, h: 30 },
      };
      cache.set('btn-1', elem);

      setDesktopSnapshotCache(cache);
      expect(desktopSnapshotCache).not.toBeNull();
      expect(desktopSnapshotCache?.has('btn-1')).toBe(true);
      expect(desktopSnapshotCache?.get('btn-1')?.name).toBe('OK');
    });

    // 10
    it('setDesktopSnapshotCache(null) 应清除缓存', () => {
      const cache = new Map<string, DesktopElement>();
      cache.set('btn-1', {
        ref: 'btn-1',
        role: 'button',
        name: 'OK',
        bounds: { x: 100, y: 200, w: 80, h: 30 },
      });
      setDesktopSnapshotCache(cache);
      expect(desktopSnapshotCache).not.toBeNull();

      setDesktopSnapshotCache(null);
      expect(desktopSnapshotCache).toBeNull();
    });

    // 11
    it('应正确存储多个元素', () => {
      const cache = new Map<string, DesktopElement>();
      cache.set('btn-1', {
        ref: 'btn-1',
        role: 'button',
        name: 'OK',
        bounds: { x: 100, y: 200, w: 80, h: 30 },
      });
      cache.set('input-1', {
        ref: 'input-1',
        role: 'textField',
        name: 'Username',
        value: '',
        enabled: true,
        bounds: { x: 100, y: 100, w: 200, h: 30 },
      });

      setDesktopSnapshotCache(cache);
      expect(desktopSnapshotCache?.size).toBe(2);
      expect(desktopSnapshotCache?.get('input-1')?.role).toBe('textField');
    });
  });

  // 12
  describe('平台检测', () => {
    it('PLATFORM 应为字符串', () => {
      expect(typeof PLATFORM).toBe('string');
      expect(PLATFORM.length).toBeGreaterThan(0);
    });

    it('isMac 和 isLinux 应为布尔值', () => {
      expect(typeof isMac).toBe('boolean');
      expect(typeof isLinux).toBe('boolean');
    });
  });
});
