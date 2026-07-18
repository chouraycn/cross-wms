/**
 * Link Preview 单元测试
 */

import { describe, it, expect } from 'vitest';
import {
  buildPreviewFromHtml,
  generatePreview,
  generatePreviews,
  buildFallbackPreview,
  formatPreviewAsText,
} from '../preview.js';

const HTML_WITH_OG = `
<html>
<head>
  <meta property="og:title" content="示例标题">
  <meta property="og:description" content="示例描述">
  <meta property="og:image" content="https://example.com/img.png">
  <meta property="og:site_name" content="示例站">
  <meta name="twitter:card" content="summary_large_image">
</head>
<body></body>
</html>
`;

const HTML_MINIMAL = `<html><head><title>简单页面</title></head><body>内容</body></html>`;

describe('buildPreviewFromHtml', () => {
  it('应从 OG 标签提取预览信息', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_WITH_OG);
    expect(preview.url).toBe('https://example.com');
    expect(preview.title).toBe('示例标题');
    expect(preview.description).toBe('示例描述');
    expect(preview.image).toBe('https://example.com/img.png');
    expect(preview.siteName).toBe('示例站');
    expect(preview.cardType).toBe('summary_large_image');
  });

  it('应包含 favicon 图标', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_WITH_OG);
    expect(preview.icon).toContain('example.com');
  });

  it('无 OG 标签时仍能生成基础预览', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_MINIMAL);
    expect(preview.url).toBe('https://example.com');
    expect(preview.title).toBe('简单页面');
    expect(preview.cardType).toBe('summary');
  });

  it('应支持 finalUrl 和 contentType', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_WITH_OG, {
      finalUrl: 'https://example.com/redirected',
      contentType: 'text/html',
    });
    expect(preview.finalUrl).toBe('https://example.com/redirected');
    expect(preview.contentType).toBe('text/html');
  });

  it('应保存元数据', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_WITH_OG);
    expect(preview.metadata).toBeDefined();
    expect(preview.metadata!.openGraph!['og:title']).toBe('示例标题');
  });
});

describe('generatePreview', () => {
  it('未配置 fetchHtml 时应抛错', async () => {
    await expect(generatePreview('https://example.com')).rejects.toThrow(
      /未配置 fetchHtml/,
    );
  });

  it('应通过 fetchHtml 抓取并生成预览', async () => {
    const fetchHtml = async () => ({
      html: HTML_WITH_OG,
      finalUrl: 'https://example.com/final',
      contentType: 'text/html',
    });
    const preview = await generatePreview('https://example.com', { fetchHtml });
    expect(preview.title).toBe('示例标题');
    expect(preview.finalUrl).toBe('https://example.com/final');
  });

  it('抓取失败时应返回回退预览', async () => {
    const fetchHtml = async () => {
      throw new Error('网络错误');
    };
    const preview = await generatePreview('https://example.com', { fetchHtml });
    expect(preview.cardType).toBe('none');
    expect(preview.url).toBe('https://example.com');
  });
});

describe('generatePreviews', () => {
  it('应批量生成预览', async () => {
    const fetchHtml = async (url: string) => ({
      html: `<html><head><meta property="og:title" content="${url}"></head></html>`,
      finalUrl: url,
    });
    const previews = await generatePreviews(
      ['https://a.example', 'https://b.example'],
      { fetchHtml },
    );
    expect(previews).toHaveLength(2);
    expect(previews[0].title).toBe('https://a.example');
    expect(previews[1].title).toBe('https://b.example');
  });
});

describe('buildFallbackPreview', () => {
  it('应生成包含域名的基础预览', () => {
    const preview = buildFallbackPreview('https://example.com/page', 'error');
    expect(preview.url).toBe('https://example.com/page');
    expect(preview.title).toBe('example.com');
    expect(preview.siteName).toBe('example.com');
    expect(preview.cardType).toBe('none');
  });

  it('无域名时使用 URL 作为标题', () => {
    const preview = buildFallbackPreview('https://localhost/path');
    expect(preview.title).toBe('https://localhost/path');
  });
});

describe('formatPreviewAsText', () => {
  it('应生成包含标题和链接的文本', () => {
    const preview = buildPreviewFromHtml('https://example.com', HTML_WITH_OG);
    const text = formatPreviewAsText(preview);
    expect(text).toContain('示例标题');
    expect(text).toContain('https://example.com');
  });

  it('应截断超长描述', () => {
    const longDesc = 'A'.repeat(300);
    const preview = buildPreviewFromHtml(
      'https://example.com',
      `<html><meta property="og:description" content="${longDesc}"></html>`,
    );
    const text = formatPreviewAsText(preview);
    expect(text).toContain('…');
    expect(text.length).toBeLessThan(longDesc.length);
  });

  it('无描述时仅包含标题和链接', () => {
    const preview = buildFallbackPreview('https://example.com');
    const text = formatPreviewAsText(preview);
    expect(text).toContain('example.com');
    expect(text).toContain('https://example.com');
  });
});
