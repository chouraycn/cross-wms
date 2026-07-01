/**
 * 图片消毒模块测试
 */
import { describe, it, expect } from 'vitest';
import {
  resolveImageSanitizationLimits,
  estimateImageTokens,
} from '../imageSanitization.js';

describe('imageSanitization', () => {
  describe('resolveImageSanitizationLimits', () => {
    it('should return empty object when no config provided', () => {
      const limits = resolveImageSanitizationLimits();
      expect(limits).toEqual({});
    });

    it('should return empty object when aiEngine is missing', () => {
      const limits = resolveImageSanitizationLimits({});
      expect(limits).toEqual({});
    });

    it('should parse maxDimensionPx from config', () => {
      const limits = resolveImageSanitizationLimits({
        aiEngine: { imageMaxDimensionPx: 800 },
      });
      expect(limits.maxDimensionPx).toBe(800);
    });

    it('should parse maxBytes from config', () => {
      const limits = resolveImageSanitizationLimits({
        aiEngine: { imageMaxBytes: 2 * 1024 * 1024 },
      });
      expect(limits.maxBytes).toBe(2 * 1024 * 1024);
    });

    it('should ignore invalid values', () => {
      const limits = resolveImageSanitizationLimits({
        aiEngine: { imageMaxDimensionPx: -10, imageMaxBytes: 0 },
      });
      expect(limits.maxDimensionPx).toBeUndefined();
      expect(limits.maxBytes).toBeUndefined();
    });
  });

  describe('estimateImageTokens', () => {
    it('should return 85 tokens for low detail', () => {
      expect(estimateImageTokens(1000, 1000, 'low')).toBe(85);
    });

    it('should return 85 tokens for small images with auto detail', () => {
      expect(estimateImageTokens(512, 512, 'auto')).toBe(85);
    });

    it('should calculate correctly for high detail images', () => {
      const tokens = estimateImageTokens(1024, 1024, 'high');
      expect(tokens).toBeGreaterThan(85);
      expect(tokens).toBeLessThan(1000);
    });

    it('should default to auto detail', () => {
      const smallTokens = estimateImageTokens(256, 256);
      const largeTokens = estimateImageTokens(1024, 768);
      expect(smallTokens).toBe(85);
      expect(largeTokens).toBeGreaterThan(85);
    });
  });
});
