import { describe, it, expect } from 'vitest';
import { generateSlug, generateSlugFromLLM } from '../llm-slug-generator.js';

describe('llm-slug-generator', () => {
  describe('generateSlug', () => {
    it('should generate basic slug from simple text', () => {
      const result = generateSlug('Hello World');
      expect(result).toBe('hello-world');
    });

    it('should convert to lowercase by default', () => {
      const result = generateSlug('HELLO WORLD');
      expect(result).toBe('hello-world');
    });

    it('should preserve case when lowerCase is false', () => {
      const result = generateSlug('Hello World', { lowerCase: false });
      expect(result).toBe('Hello-World');
    });

    it('should replace special characters with separator', () => {
      const result = generateSlug('hello@world#test$123');
      expect(result).toBe('hello-world-test-123');
    });

    it('should trim leading and trailing separators', () => {
      const result = generateSlug('  hello world  ');
      expect(result).toBe('hello-world');
    });

    it('should collapse multiple separators', () => {
      const result = generateSlug('hello---world');
      expect(result).toBe('hello-world');
    });

    it('should use custom separator', () => {
      const result = generateSlug('hello world', { separator: '_' });
      expect(result).toBe('hello_world');
    });

    it('should truncate to maxLength', () => {
      const result = generateSlug('a'.repeat(100), { maxLength: 50 });
      expect(result.length).toBeLessThanOrEqual(50);
    });

    it('should not leave trailing separator after truncation', () => {
      const input = 'hello-world-test-abc-def-ghi-jkl';
      const result = generateSlug(input, { maxLength: 15 });
      expect(result.endsWith('-')).toBe(false);
    });

    it('should handle Chinese characters', () => {
      const result = generateSlug('你好世界');
      expect(result).toBe('你好世界');
    });

    it('should handle mixed Chinese and English', () => {
      const result = generateSlug('你好 World 测试');
      expect(result).toContain('你好');
      expect(result).toContain('world');
      expect(result).toContain('测试');
    });

    it('should return "untitled" for empty input', () => {
      const result = generateSlug('');
      expect(result).toBe('untitled');
    });

    it('should return "untitled" for only special chars', () => {
      const result = generateSlug('!!!@@@###');
      expect(result).toBe('untitled');
    });

    it('should remove diacritics from accented characters', () => {
      const result = generateSlug('café résumé');
      expect(result).toBe('cafe-resume');
    });

    it('should handle numbers correctly', () => {
      const result = generateSlug('item-123-test-456');
      expect(result).toBe('item-123-test-456');
    });

    it('should use default maxLength of 60', () => {
      const input = 'a'.repeat(100);
      const result = generateSlug(input);
      expect(result.length).toBeLessThanOrEqual(60);
    });
  });

  describe('generateSlugFromLLM', () => {
    it('should generate slug from first meaningful line', async () => {
      const content = `
# My Project Title

This is the description.
More content here.
      `;
      const result = await generateSlugFromLLM(content);
      expect(result).toBe('my-project-title');
    });

    it('should skip empty lines at the beginning', async () => {
      const content = `


First Real Line

rest of content
      `;
      const result = await generateSlugFromLLM(content);
      expect(result).toContain('first');
    });

    it('should use slice of content when no long lines found', async () => {
      const content = 'sh';
      const result = await generateSlugFromLLM(content);
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle single line content', async () => {
      const content = 'Single Line Content Here';
      const result = await generateSlugFromLLM(content);
      expect(result).toBe('single-line-content-here');
    });

    it('should respect options passed to generateSlug', async () => {
      const content = 'Hello World Test';
      const result = await generateSlugFromLLM(content, { separator: '_', maxLength: 10 });
      expect(result).toContain('_');
      expect(result.length).toBeLessThanOrEqual(10);
    });

    it('should handle completely empty content', async () => {
      const result = await generateSlugFromLLM('');
      expect(result).toBe('untitled');
    });

    it('should handle whitespace-only content', async () => {
      const result = await generateSlugFromLLM('   \n  \t  ');
      expect(result).toBe('untitled');
    });
  });
});
