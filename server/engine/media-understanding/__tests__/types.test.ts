/**
 * Media Understanding Types 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ANALYZE_OPTIONS,
  DEFAULT_CACHE_MAX_ENTRIES,
  DEFAULT_CACHE_TTL_MS,
  inferMediaKind,
} from '../types.js';

describe('Media Understanding Types', () => {
  describe('默认配置', () => {
    it('DEFAULT_ANALYZE_OPTIONS 应包含合理的默认值', () => {
      expect(DEFAULT_ANALYZE_OPTIONS.ocr).toBe(false);
      expect(DEFAULT_ANALYZE_OPTIONS.faceDetection).toBe(false);
      expect(DEFAULT_ANALYZE_OPTIONS.safetyDetection).toBe(true);
      expect(DEFAULT_ANALYZE_OPTIONS.skipCache).toBe(false);
      expect(DEFAULT_ANALYZE_OPTIONS.maxLength).toBe(100_000);
      expect(DEFAULT_ANALYZE_OPTIONS.timeoutMs).toBe(30_000);
    });

    it('默认缓存配置应有合理值', () => {
      expect(DEFAULT_CACHE_MAX_ENTRIES).toBe(200);
      expect(DEFAULT_CACHE_TTL_MS).toBe(10 * 60 * 1000);
    });
  });

  describe('inferMediaKind', () => {
    it('应根据 MIME 推断图像类型', () => {
      expect(inferMediaKind('image/png')).toBe('image');
      expect(inferMediaKind('image/jpeg')).toBe('image');
      expect(inferMediaKind('image/gif')).toBe('image');
    });

    it('应根据 MIME 推断视频类型', () => {
      expect(inferMediaKind('video/mp4')).toBe('video');
      expect(inferMediaKind('video/webm')).toBe('video');
    });

    it('应根据 MIME 推断音频类型', () => {
      expect(inferMediaKind('audio/mpeg')).toBe('audio');
      expect(inferMediaKind('audio/wav')).toBe('audio');
    });

    it('应根据 MIME 推断文档类型', () => {
      expect(inferMediaKind('application/pdf')).toBe('document');
      expect(inferMediaKind('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('document');
      expect(inferMediaKind('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('document');
    });

    it('应根据文件名推断类型', () => {
      expect(inferMediaKind(undefined, 'photo.png')).toBe('image');
      expect(inferMediaKind(undefined, 'clip.mp4')).toBe('video');
      expect(inferMediaKind(undefined, 'song.mp3')).toBe('audio');
      expect(inferMediaKind(undefined, 'report.pdf')).toBe('document');
      expect(inferMediaKind(undefined, 'data.xlsx')).toBe('document');
    });

    it('文件名大小写不影响推断', () => {
      expect(inferMediaKind(undefined, 'PHOTO.PNG')).toBe('image');
      expect(inferMediaKind(undefined, 'Video.MP4')).toBe('video');
    });

    it('无法推断时返回 null', () => {
      expect(inferMediaKind(undefined, 'unknown.xyz')).toBeNull();
      expect(inferMediaKind(undefined, undefined)).toBeNull();
      expect(inferMediaKind('application/octet-stream', 'file.bin')).toBeNull();
    });
  });
});
