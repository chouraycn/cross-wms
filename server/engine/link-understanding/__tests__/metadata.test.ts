/**
 * Link Metadata 单元测试
 */

import { describe, it, expect } from 'vitest';
import * as cheerio from 'cheerio';
import {
  parseMetadataFromHtml,
  parseOpenGraph,
  parseTwitterCard,
  parseJsonLd,
  parseStandardMeta,
  resolveTitle,
  resolveDescription,
  resolveImage,
  resolveSiteName,
  resolveCardType,
} from '../metadata.js';

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head>
  <title>测试页面标题</title>
  <meta name="description" content="这是页面描述">
  <meta property="og:title" content="OG 标题">
  <meta property="og:description" content="OG 描述">
  <meta property="og:image" content="https://example.com/og.png">
  <meta property="og:site_name" content="示例站">
  <meta property="og:url" content="https://example.com/page">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="Twitter 标题">
  <meta name="twitter:image" content="https://example.com/tw.png">
  <script type="application/ld+json">
    {"@type":"Article","headline":"JSON-LD 文章"}
  </script>
  <script type="application/ld+json">
    [{"@type":"BreadcrumbList"},{"@type":"Organization","name":"测试"}]
  </script>
</head>
<body></body>
</html>
`;

describe('parseOpenGraph', () => {
  it('应解析 og: 前缀的 meta 标签', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const og = parseOpenGraph($);
    expect(og['og:title']).toBe('OG 标题');
    expect(og['og:description']).toBe('OG 描述');
    expect(og['og:image']).toBe('https://example.com/og.png');
    expect(og['og:site_name']).toBe('示例站');
  });

  it('无 og 标签时返回空对象', () => {
    const $ = cheerio.load('<html></html>');
    expect(parseOpenGraph($)).toEqual({});
  });
});

describe('parseTwitterCard', () => {
  it('应解析 twitter: 前缀的 meta 标签', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const tw = parseTwitterCard($);
    expect(tw['twitter:card']).toBe('summary_large_image');
    expect(tw['twitter:title']).toBe('Twitter 标题');
  });

  it('无 twitter 标签时返回空对象', () => {
    const $ = cheerio.load('<html></html>');
    expect(parseTwitterCard($)).toEqual({});
  });
});

describe('parseJsonLd', () => {
  it('应解析 JSON-LD 脚本块', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const jsonLd = parseJsonLd($);
    expect(jsonLd).toHaveLength(2);
    expect((jsonLd[0] as { '@type': string })['@type']).toBe('Article');
    expect(Array.isArray(jsonLd[1])).toBe(true);
  });

  it('无效 JSON 应被跳过', () => {
    const $ = cheerio.load(
      '<script type="application/ld+json">not json</script>',
    );
    expect(parseJsonLd($)).toHaveLength(0);
  });

  it('无 JSON-LD 时返回空数组', () => {
    const $ = cheerio.load('<html></html>');
    expect(parseJsonLd($)).toHaveLength(0);
  });
});

describe('parseStandardMeta', () => {
  it('应解析标准 meta 标签（跳过 twitter:）', () => {
    const $ = cheerio.load(SAMPLE_HTML);
    const standard = parseStandardMeta($);
    expect(standard['description']).toBe('这是页面描述');
    expect(standard['twitter:card']).toBeUndefined();
  });
});

describe('parseMetadataFromHtml', () => {
  it('应聚合所有元数据', () => {
    const metadata = parseMetadataFromHtml(SAMPLE_HTML);
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.openGraph!['og:title']).toBe('OG 标题');
    expect(metadata.twitter).toBeDefined();
    expect(metadata.twitter!['twitter:card']).toBe('summary_large_image');
    expect(metadata.jsonLd).toBeDefined();
    expect(metadata.jsonLd!.length).toBeGreaterThanOrEqual(1);
    expect(metadata.standard).toBeDefined();
    expect(metadata.standard!['description']).toBe('这是页面描述');
  });

  it('无元数据时返回空对象', () => {
    const metadata = parseMetadataFromHtml('<html><body>无 meta</body></html>');
    expect(metadata).toEqual({});
  });
});

describe('resolve 辅助函数', () => {
  const metadata = parseMetadataFromHtml(SAMPLE_HTML);

  it('resolveTitle 应优先 og:title', () => {
    expect(resolveTitle(metadata)).toBe('OG 标题');
  });

  it('resolveDescription 应优先 og:description', () => {
    expect(resolveDescription(metadata)).toBe('OG 描述');
  });

  it('resolveImage 应优先 og:image', () => {
    expect(resolveImage(metadata)).toBe('https://example.com/og.png');
  });

  it('resolveSiteName 应返回 og:site_name', () => {
    expect(resolveSiteName(metadata)).toBe('示例站');
  });

  it('resolveCardType 应根据 twitter:card 返回类型', () => {
    expect(resolveCardType(metadata)).toBe('summary_large_image');
  });

  it('仅有 og:title 时 resolveCardType 返回 summary', () => {
    const md = { openGraph: { 'og:title': '标题' } };
    expect(resolveCardType(md)).toBe('summary');
  });

  it('无卡片信息时 resolveCardType 返回 none', () => {
    expect(resolveCardType({})).toBe('none');
  });

  it('resolveTitle 在 og 缺失时应回退到 standard', () => {
    expect(resolveTitle({ standard: { title: '标准标题' } })).toBe('标准标题');
  });
});
