/**
 * Canvas Types 单元测试
 *
 * 覆盖：
 * - normalizeCanvasSnapshotFileExtension
 * - parseCanvasSnapshotPayload
 */

import { describe, it, expect } from 'vitest';
import {
  normalizeCanvasSnapshotFileExtension,
  parseCanvasSnapshotPayload,
} from '../types.js';
import type { CanvasSnapshotPayload } from '../types.js';

describe('Canvas Types — 类型与辅助函数', () => {
  // 1
  describe('normalizeCanvasSnapshotFileExtension', () => {
    it('应规范化 png 扩展名', () => {
      expect(normalizeCanvasSnapshotFileExtension('png')).toBe('png');
      expect(normalizeCanvasSnapshotFileExtension('PNG')).toBe('png');
      expect(normalizeCanvasSnapshotFileExtension('.png')).toBe('png');
      expect(normalizeCanvasSnapshotFileExtension('..png')).toBe('png');
    });

    // 2
    it('应规范化 jpg/jpeg 扩展名', () => {
      expect(normalizeCanvasSnapshotFileExtension('jpg')).toBe('jpg');
      expect(normalizeCanvasSnapshotFileExtension('jpeg')).toBe('jpg');
      expect(normalizeCanvasSnapshotFileExtension('JPEG')).toBe('jpg');
      expect(normalizeCanvasSnapshotFileExtension('.jpg')).toBe('jpg');
    });

    // 3
    it('未知扩展名应回退到 png', () => {
      expect(normalizeCanvasSnapshotFileExtension('gif')).toBe('png');
      expect(normalizeCanvasSnapshotFileExtension('bmp')).toBe('png');
      expect(normalizeCanvasSnapshotFileExtension('')).toBe('png');
    });
  });

  // 4
  describe('parseCanvasSnapshotPayload', () => {
    it('应解析直接的 {base64, format} 结构', () => {
      const raw = {
        format: 'png',
        base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        width: 100,
        height: 50,
      };

      const result = parseCanvasSnapshotPayload(raw);
      expect(result.format).toBe('png');
      expect(result.base64).toBe(raw.base64);
      expect(result.width).toBe(100);
      expect(result.height).toBe(50);
    });

    // 5
    it('应解析嵌套的 {payload: {base64, format}} 结构', () => {
      const raw = {
        payload: {
          format: 'jpeg',
          base64: 'test-base64-data',
        },
      };

      const result = parseCanvasSnapshotPayload(raw);
      expect(result.format).toBe('jpeg');
      expect(result.base64).toBe('test-base64-data');
    });

    // 6
    it('缺失 base64 应抛出错误', () => {
      expect(() => parseCanvasSnapshotPayload({ format: 'png' })).toThrow();
      expect(() => parseCanvasSnapshotPayload({ base64: '' })).toThrow();
    });

    // 7
    it('非对象输入应抛出错误', () => {
      expect(() => parseCanvasSnapshotPayload(null)).toThrow();
      expect(() => parseCanvasSnapshotPayload(undefined)).toThrow();
      expect(() => parseCanvasSnapshotPayload('string')).toThrow();
      expect(() => parseCanvasSnapshotPayload(123)).toThrow();
    });

    // 8
    it('format 应为 jpg/jpeg 时规范化为 jpeg', () => {
      const result1 = parseCanvasSnapshotPayload({ format: 'jpg', base64: 'test' });
      expect(result1.format).toBe('jpeg');

      const result2 = parseCanvasSnapshotPayload({ format: 'JPG', base64: 'test' });
      expect(result2.format).toBe('jpeg');

      const result3 = parseCanvasSnapshotPayload({ format: 'JPEG', base64: 'test' });
      expect(result3.format).toBe('jpeg');
    });

    // 9
    it('默认 format 为 png', () => {
      const result = parseCanvasSnapshotPayload({ base64: 'test' });
      expect(result.format).toBe('png');
    });

    // 10
    it('可选的 width/height 应正确传递', () => {
      const result = parseCanvasSnapshotPayload({
        base64: 'test',
        width: 800,
        height: 600,
      });
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });
  });
});
