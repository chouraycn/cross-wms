/**
 * Wiki Tools 测试
 *
 * 测试 Wiki 知识库工具的核心功能
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  createLink,
  getLink,
  deleteLink,
  addTagToEntry,
  getEntryTags,
  getEntryVersions,
  hybridSearch,
  getWikiStats,
  clearAllWiki,
} from '../wikiStore.js';
import { parseMarkdown, extractKeywords } from '../wikiIndexer.js';
import {
  createWikiSearchToolHandler,
  createWikiCreateToolHandler,
  createWikiUpdateToolHandler,
  createWikiDeleteToolHandler,
  createWikiGetToolHandler,
  createWikiStatsToolHandler,
} from '../wikiTools.js';

// ===================== 测试数据 =====================

const sampleMarkdown = `---
title: "API 设计指南"
tags: ["API", "REST", "设计"]
---

# API 设计指南

本文档介绍 RESTful API 的最佳设计实践。

## 设计原则

1. **一致性**：API 的命名和结构应该保持一致
2. **简洁性**：API 应该简单易懂
3. **可扩展性**：API 应该易于扩展

## 代码示例

\`\`\`typescript
interface ApiResponse {
  code: number;
  data: unknown;
  message: string;
}
\`\`\`

## 参考链接

- [REST API Tutorial](https://restfulapi.net/)
- [OpenAPI Specification](https://swagger.io/specification/)
`;

// ===================== Markdown 解析测试 =====================

describe('Wiki Indexer - Markdown 解析', () => {
  it('应该正确解析 Markdown 文件的标题', () => {
    const result = parseMarkdown(sampleMarkdown);
    expect(result.title).toBe('API 设计指南');
  });

  it('应该正确提取 YAML frontmatter 中的标签', () => {
    const result = parseMarkdown(sampleMarkdown);
    expect(result.tags).toContain('API');
    expect(result.tags).toContain('REST');
    expect(result.tags).toContain('设计');
  });

  it('应该正确提取代码块', () => {
    const result = parseMarkdown(sampleMarkdown);
    expect(result.codeBlocks).toBeDefined();
    expect(result.codeBlocks?.length).toBeGreaterThan(0);
    expect(result.codeBlocks?.[0].language).toBe('typescript');
  });

  it('应该正确提取链接', () => {
    const result = parseMarkdown(sampleMarkdown);
    expect(result.links).toBeDefined();
    expect(result.links?.length).toBeGreaterThan(0);
    expect(result.links?.[0].url).toContain('restfulapi.net');
  });

  it('应该正确生成摘要', () => {
    const result = parseMarkdown(sampleMarkdown);
    expect(result.summary).toBeDefined();
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.summary.length).toBeLessThan(250);
  });
});

// ===================== 关键词提取测试 =====================

describe('Wiki Indexer - 关键词提取', () => {
  it('应该提取英文关键词', () => {
    const text = 'The REST API provides JSON response with HTTP protocol.';
    const keywords = extractKeywords(text, 5);
    expect(keywords).toContain('REST');
    expect(keywords).toContain('API');
    expect(keywords).toContain('JSON');
    expect(keywords).toContain('HTTP');
  });

  it('应该提取技术术语', () => {
    const text = 'We use Docker and Kubernetes for deployment. Redis for caching.';
    const keywords = extractKeywords(text, 5);
    expect(keywords).toContain('Docker');
    expect(keywords).toContain('Kubernetes');
    expect(keywords).toContain('Redis');
  });

  it('应该限制返回数量', () => {
    const text = 'JavaScript TypeScript Python Java Go Rust React Vue Angular Node Express';
    const keywords = extractKeywords(text, 5);
    expect(keywords.length).toBeLessThanOrEqual(5);
  });
});

// ===================== Wiki Store CRUD 测试 =====================

describe('Wiki Store - CRUD 操作', () => {
  beforeAll(async () => {
    // 清空测试数据
    clearAllWiki();
  });

  afterAll(() => {
    // 清理测试数据
    clearAllWiki();
  });

  it('应该成功创建 Wiki 条目', async () => {
    const entry = await createEntry({
      title: '测试条目',
      content: '这是测试内容，用于验证 Wiki 条目创建功能。',
      summary: '测试摘要',
      source: 'manual',
    });

    expect(entry).toBeDefined();
    expect(entry.id).toBeGreaterThan(0);
    expect(entry.title).toBe('测试条目');
    expect(entry.content).toContain('测试内容');
  });

  it('应该成功获取 Wiki 条目', async () => {
    const created = await createEntry({
      title: '获取测试',
      content: '获取测试内容',
    });

    const entry = getEntry(created.id);
    expect(entry).toBeDefined();
    expect(entry?.title).toBe('获取测试');
  });

  it('应该成功更新 Wiki 条目', async () => {
    const created = await createEntry({
      title: '更新测试',
      content: '原始内容',
    });

    const updated = await updateEntry({
      id: created.id,
      title: '更新后的标题',
      content: '更新后的内容',
    });

    expect(updated).toBeDefined();
    expect(updated?.title).toBe('更新后的标题');
    expect(updated?.content).toBe('更新后的内容');

    // 检查版本历史
    const versions = getEntryVersions(created.id);
    expect(versions.length).toBeGreaterThan(0);
  });

  it('应该成功删除 Wiki 条目', async () => {
    const created = await createEntry({
      title: '删除测试',
      content: '待删除内容',
    });

    const success = deleteEntry(created.id);
    expect(success).toBe(true);

    const entry = getEntry(created.id);
    expect(entry).toBeNull();
  });

  it('应该成功添加标签', async () => {
    const created = await createEntry({
      title: '标签测试',
      content: '标签测试内容',
    });

    const success = addTagToEntry(created.id, 'test-tag');
    expect(success).toBe(true);

    const tags = getEntryTags(created.id);
    expect(tags).toContain('test-tag');
  });
});

// ===================== Wiki Store 链接测试 =====================

describe('Wiki Store - 链接管理', () => {
  let sourceEntry: any;
  let targetEntry: any;

  beforeAll(async () => {
    clearAllWiki();

    sourceEntry = await createEntry({
      title: '源条目',
      content: '这是源条目',
    });

    targetEntry = await createEntry({
      title: '目标条目',
      content: '这是目标条目',
    });
  });

  afterAll(() => {
    clearAllWiki();
  });

  it('应该成功创建链接', () => {
    const link = createLink({
      sourceId: sourceEntry.id,
      targetId: targetEntry.id,
      linkType: 'reference',
      weight: 1.0,
    });

    expect(link).toBeDefined();
    expect(link?.sourceId).toBe(sourceEntry.id);
    expect(link?.targetId).toBe(targetEntry.id);
  });

  it('应该成功获取链接', () => {
    const created = createLink({
      sourceId: sourceEntry.id,
      targetId: targetEntry.id,
      linkType: 'related',
    });

    const link = getLink(created!.id);
    expect(link).toBeDefined();
    expect(link?.linkType).toBe('related');
  });

  it('应该成功删除链接', () => {
    const created = createLink({
      sourceId: sourceEntry.id,
      targetId: targetEntry.id,
      linkType: 'see_also',
    });

    const success = deleteLink(created!.id);
    expect(success).toBe(true);

    const link = getLink(created!.id);
    expect(link).toBeNull();
  });
});

// ===================== Wiki Store 搜索测试 =====================

describe('Wiki Store - 搜索功能', () => {
  beforeAll(async () => {
    clearAllWiki();

    // 创建测试条目
    await createEntry({
      title: 'API 设计原则',
      content: 'RESTful API 设计的核心原则包括一致性、简洁性和可扩展性。',
      summary: 'RESTful API 设计指南',
    });

    await createEntry({
      title: '数据库优化',
      content: '数据库性能优化的最佳实践，包括索引优化、查询优化等。',
      summary: '数据库性能优化',
    });

    await createEntry({
      title: '前端开发',
      content: 'React 和 Vue 是目前最流行的前端框架。',
      summary: '前端开发框架介绍',
    });
  });

  afterAll(() => {
    clearAllWiki();
  });

  it('应该成功执行混合搜索', async () => {
    const results = await hybridSearch({
      query: 'API 设计',
      topK: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('API');
  });

  it('应该返回正确的相似度得分', async () => {
    const results = await hybridSearch({
      query: '数据库',
      topK: 5,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity).toBeGreaterThan(0);
    expect(results[0].similarity).toBeLessThanOrEqual(1);
  });
});

// ===================== Wiki Tools 测试 =====================

describe('Wiki Tools - 工具处理器', () => {
  beforeAll(async () => {
    clearAllWiki();
  });

  afterAll(() => {
    clearAllWiki();
  });

  it('wiki_create 应该成功创建条目', async () => {
    const handler = createWikiCreateToolHandler();
    const result = await handler({
      title: '工具测试条目',
      content: '这是通过 wiki_create 工具创建的条目',
      tags: ['test', 'tool'],
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.id).toBeGreaterThan(0);
    expect(parsed.entry.title).toBe('工具测试条目');
  });

  it('wiki_search 应该返回搜索结果', async () => {
    // 先创建一个条目
    const createHandler = createWikiCreateToolHandler();
    await createHandler({
      title: '搜索测试条目',
      content: '搜索测试内容',
    });

    const searchHandler = createWikiSearchToolHandler();
    const result = await searchHandler({
      query: '搜索测试',
      topK: 5,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.count).toBeGreaterThan(0);
  });

  it('wiki_get 应该返回条目详情', async () => {
    // 创建条目
    const createHandler = createWikiCreateToolHandler();
    const createResult = await createHandler({
      title: '获取测试条目',
      content: '获取测试内容',
    });
    const parsedCreate = JSON.parse(createResult);

    const getHandler = createWikiGetToolHandler();
    const result = await getHandler({
      id: parsedCreate.entry.id,
      includeTags: true,
      includeLinks: true,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.title).toBe('获取测试条目');
  });

  it('wiki_stats 应该返回统计信息', async () => {
    // 创建几个条目
    const createHandler = createWikiCreateToolHandler();
    await createHandler({ title: '统计条目 1', content: '内容 1' });
    await createHandler({ title: '统计条目 2', content: '内容 2' });

    const statsHandler = createWikiStatsToolHandler();
    const result = await statsHandler({});

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.stats.totalEntries).toBeGreaterThan(0);
  });

  it('wiki_update 应该成功更新条目', async () => {
    // 创建条目
    const createHandler = createWikiCreateToolHandler();
    const createResult = await createHandler({
      title: '更新前标题',
      content: '更新前内容',
    });
    const parsedCreate = JSON.parse(createResult);

    const updateHandler = createWikiUpdateToolHandler();
    const result = await updateHandler({
      id: parsedCreate.entry.id,
      title: '更新后标题',
      content: '更新后内容',
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
    expect(parsed.entry.title).toBe('更新后标题');
  });

  it('wiki_delete 应该成功删除条目', async () => {
    // 创建条目
    const createHandler = createWikiCreateToolHandler();
    const createResult = await createHandler({
      title: '待删除条目',
      content: '待删除内容',
    });
    const parsedCreate = JSON.parse(createResult);

    const deleteHandler = createWikiDeleteToolHandler();
    const result = await deleteHandler({
      id: parsedCreate.entry.id,
    });

    const parsed = JSON.parse(result);
    expect(parsed.success).toBe(true);
  });
});