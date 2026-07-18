/**
 * Content Extractors 单元测试
 *
 * 测试内容提取器的各种提取功能。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  basicExtractor,
  titleExtractor,
  metadataExtractor,
  getExtractors,
  getExtractor,
  registerExtractor,
  resetExtractors,
  extractContent,
} from '../content-extractors.js';
import type { ContentExtractor, ContentExtractRequest } from '../types.js';

vi.mock('../../logger.js', () => ({
  logger: {
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe('Content Extractors', () => {
  beforeEach(() => {
    resetExtractors();
  });
  const testHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>测试页面标题 - 示例网站</title>
        <meta name="description" content="这是一个测试页面的描述信息">
        <meta name="keywords" content="测试, 示例, 网页">
        <meta property="og:title" content="OG 标题">
        <meta property="og:description" content="OG 描述">
      </head>
      <body>
        <header>
          <h1>文章主标题</h1>
          <nav>导航链接</nav>
        </header>
        <main>
          <article class="content">
            <h2>章节标题</h2>
            <p>这是第一段正文内容，包含一些有意义的文字。这是第一段正文内容，包含一些有意义的文字。这是第一段正文内容，包含一些有意义的文字。</p>
            <p>这是第二段正文内容，继续描述页面的主要信息。这是第二段正文内容，继续描述页面的主要信息。</p>
            <p>这是第三段正文内容，提供更多详细信息。这是第三段正文内容，提供更多详细信息。</p>
          </article>
        </main>
        <footer>
          <p>版权信息</p>
        </footer>
      </body>
    </html>
  `;

  describe('basicExtractor', () => {
    it('应能提取基本信息', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r).not.toBeNull();
        expect(r?.content).toBeDefined();
        expect(r?.content.length).toBeGreaterThan(0);
        expect(r?.extractorId).toBe('basic');
        expect(r?.contentType).toBe('text');
      });
    });

    it('应能提取标题', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r?.title).toBeDefined();
        expect(r?.title).toContain('测试页面标题');
      });
    });

    it('应能提取元数据', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r?.metadata).toBeDefined();
        expect(r?.metadata?.['description']).toContain('测试页面的描述');
      });
    });

    it('应支持 HTML 提取模式', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'html',
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r?.contentType).toBe('html');
        expect(r?.content).toContain('<');
      });
    });

    it('应遵守 maxLength 限制', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
        maxLength: 50,
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r?.content.length).toBeLessThanOrEqual(50);
        expect(r?.truncated).toBe(true);
      });
    });

    it('空 HTML 应返回 null', () => {
      const request: ContentExtractRequest = {
        html: '',
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = basicExtractor.extract(request);
      return result.then((r) => {
        expect(r).toBeNull();
      });
    });

    it('supports 方法应正确判断支持性', () => {
      expect(basicExtractor.supports({ html: '<html></html>', url: '', extractMode: 'text' })).toBe(true);
      expect(basicExtractor.supports({ html: '', url: '', extractMode: 'text' })).toBe(false);
    });
  });

  describe('titleExtractor', () => {
    it('应能从 title 标签提取标题', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = titleExtractor.extract(request);
      return result.then((r) => {
        expect(r).not.toBeNull();
        expect(r?.title).toContain('测试页面标题');
        expect(r?.content).toContain('测试页面标题');
      });
    });

    it('应能从 h1 标签提取标题作为备用', () => {
      const html = '<html><body><h1>H1 标题</h1><p>内容</p></body></html>';
      const request: ContentExtractRequest = {
        html,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = titleExtractor.extract(request);
      return result.then((r) => {
        expect(r?.title).toContain('H1 标题');
      });
    });

    it('应能从 og:title 提取标题', () => {
      const html = '<html><head><meta property="og:title" content="OG 标题"></head><body></body></html>';
      const request: ContentExtractRequest = {
        html,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = titleExtractor.extract(request);
      return result.then((r) => {
        expect(r?.title).toBe('OG 标题');
      });
    });

    it('空 HTML 应返回 null', () => {
      const request: ContentExtractRequest = {
        html: '',
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = titleExtractor.extract(request);
      return result.then((r) => {
        expect(r).toBeNull();
      });
    });
  });

  describe('metadataExtractor', () => {
    it('应能提取元数据', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = metadataExtractor.extract(request);
      return result.then((r) => {
        expect(r).not.toBeNull();
        expect(r?.metadata).toBeDefined();
        expect(r?.metadata?.['description']).toContain('测试页面的描述');
        expect(r?.metadata?.['keywords']).toContain('测试');
        expect(r?.extractorId).toBe('metadata');
      });
    });

    it('应能提取 og 元数据', () => {
      const request: ContentExtractRequest = {
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = metadataExtractor.extract(request);
      return result.then((r) => {
        expect(r?.metadata?.['og:title']).toBe('OG 标题');
        expect(r?.metadata?.['og:description']).toBe('OG 描述');
      });
    });

    it('空 HTML 应返回 null', () => {
      const request: ContentExtractRequest = {
        html: '',
        url: 'https://example.com',
        extractMode: 'text',
      };

      const result = metadataExtractor.extract(request);
      return result.then((r) => {
        expect(r).toBeNull();
      });
    });
  });

  describe('提取器管理', () => {
    it('getExtractors 应返回所有提取器', () => {
      const extractors = getExtractors();
      expect(extractors.length).toBeGreaterThanOrEqual(3);
    });

    it('提取器应按优先级排序', () => {
      const extractors = getExtractors();
      for (let i = 1; i < extractors.length; i++) {
        expect(extractors[i - 1].priority).toBeLessThanOrEqual(extractors[i].priority);
      }
    });

    it('getExtractor 应能获取指定提取器', () => {
      const extractor = getExtractor('basic');
      expect(extractor).toBeDefined();
      expect(extractor?.id).toBe('basic');
    });

    it('getExtractor 不存在时返回 undefined', () => {
      const extractor = getExtractor('non-existent');
      expect(extractor).toBeUndefined();
    });

    it('应能注册新的提取器', () => {
      const customExtractor: ContentExtractor = {
        id: 'custom',
        name: 'Custom Extractor',
        description: 'Custom extractor for testing',
        priority: 10,
        supports: () => true,
        extract: async (req) => ({
          content: req.html,
          contentType: 'text',
          contentLength: req.html.length,
          truncated: false,
          extractorId: 'custom',
        }),
      };

      registerExtractor(customExtractor);

      const found = getExtractor('custom');
      expect(found).toBeDefined();
      expect(found?.id).toBe('custom');
    });

    it('注册已存在的提取器应覆盖', () => {
      const customExtractor: ContentExtractor = {
        id: 'basic',
        name: 'Updated Basic',
        description: 'Updated',
        priority: 100,
        supports: () => true,
        extract: async () => null,
      };

      registerExtractor(customExtractor);

      const found = getExtractor('basic');
      expect(found?.name).toBe('Updated Basic');
    });
  });

  describe('extractContent', () => {
    it('应能成功提取内容', async () => {
      const result = await extractContent({
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      });

      expect(result).not.toBeNull();
      expect(result?.content.length).toBeGreaterThan(0);
    });

    it('空 HTML 应返回 null', async () => {
      const result = await extractContent({
        html: '',
        url: 'https://example.com',
        extractMode: 'text',
      });

      expect(result).toBeNull();
    });

    it('应返回第一个成功的提取器结果', async () => {
      const result = await extractContent({
        html: testHtml,
        url: 'https://example.com',
        extractMode: 'text',
      });

      expect(result?.extractorId).toBe('basic');
    });
  });
});
