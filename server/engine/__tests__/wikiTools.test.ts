/**
 * Wiki Tools 测试
 *
 * 测试 Wiki 知识库工具的核心功能
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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

// ===================== Mock 依赖 =====================

// Mock logger
vi.mock('../../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock onnxEmbedding — 避免加载真实 ONNX 模型
vi.mock('../onnxEmbedding.js', () => ({
  ONNX_EMBEDDING_DIMENSIONS: 384,
  embedText: vi.fn(async (text: string) => {
    const vec = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      vec[i] = Math.sin(text.charCodeAt(0 % text.length) + i * 0.01) * 0.01;
    }
    return vec;
  }),
  initOnnxEmbedding: vi.fn().mockResolvedValue(undefined),
  getOnnxStatus: vi.fn().mockReturnValue({ status: 'ready', error: '' }),
}));

// Mock DatabaseManager — 避免真实 SQLite 数据库
vi.mock('../../storage/databaseManager.js', () => {
  // 内存 mock 数据
  const mockState = {
    entries: [] as Array<any>,
    versions: [] as Array<any>,
    links: [] as Array<any>,
    tagDefs: [] as Array<any>, // 标签定义表 wiki_tags: {id, name, category, description, created_at}
    entryTags: [] as Array<any>, // 条目-标签关联 wiki_entry_tags: {entry_id, tag_id, created_at}
    nextEntryId: 1,
    nextVersionId: 1,
    nextLinkId: 1,
    nextTagId: 1,
  };

  const ok = { changes: 0, lastInsertRowid: 0 };
  const stmt = (extra: Record<string, any>) => ({
    run: vi.fn(() => ({ changes: 0, lastInsertRowid: 0 })),
    get: vi.fn(() => undefined),
    all: vi.fn(() => []),
    ...extra,
  });

  return {
    DatabaseManager: {
      getVecDb: () => ({
        prepare: vi.fn((sql: string) => {
          // ============ DELETE（带 WHERE 的优先匹配）============
          if (sql.includes('DELETE FROM wiki_entries WHERE id')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const id = params[0] as number;
                const idx = mockState.entries.findIndex((e) => e.id === id);
                if (idx >= 0) {
                  mockState.entries.splice(idx, 1);
                  return { changes: 1, lastInsertRowid: 0 };
                }
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_links WHERE id')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const id = params[0] as number;
                const idx = mockState.links.findIndex((l) => l.id === id);
                if (idx >= 0) {
                  mockState.links.splice(idx, 1);
                  return { changes: 1, lastInsertRowid: 0 };
                }
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_entry_tags WHERE entry_id')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const entryId = params[0];
                const tagId = params[1];
                const before = mockState.entryTags.length;
                mockState.entryTags = mockState.entryTags.filter(
                  (et) => !(et.entry_id === entryId && et.tag_id === tagId),
                );
                return { changes: before - mockState.entryTags.length, lastInsertRowid: 0 };
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_vec_index WHERE rowid')) {
            return stmt({ run: vi.fn(() => ({ changes: 1, lastInsertRowid: 0 })) });
          }
          // 全表删除（clearAllWiki）
          if (sql.includes('DELETE FROM wiki_vec_index')) {
            return stmt({ run: vi.fn(() => ok) });
          }
          if (sql.includes('DELETE FROM wiki_entry_tags')) {
            return stmt({
              run: vi.fn(() => {
                mockState.entryTags = [];
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_links')) {
            return stmt({
              run: vi.fn(() => {
                mockState.links = [];
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_versions')) {
            return stmt({
              run: vi.fn(() => {
                mockState.versions = [];
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_entries')) {
            return stmt({
              run: vi.fn(() => {
                const count = mockState.entries.length;
                mockState.entries = [];
                return { changes: count, lastInsertRowid: 0 };
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_tags')) {
            return stmt({
              run: vi.fn(() => {
                mockState.tagDefs = [];
                return ok;
              }),
            });
          }
          if (sql.includes('DELETE FROM wiki_fts')) {
            return stmt({ run: vi.fn(() => ok) });
          }

          // ============ INSERT ============
          if (sql.includes('INSERT INTO wiki_entries')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const id = mockState.nextEntryId++;
                mockState.entries.push({
                  id,
                  title: params[0],
                  content: params[1],
                  summary: params[2],
                  source: params[3] ?? 'manual',
                  source_path: params[4],
                  metadata: params[5],
                  created_at: String(Date.now()),
                  updated_at: String(Date.now()),
                });
                return { changes: 1, lastInsertRowid: id };
              }),
            });
          }
          if (sql.includes('INSERT INTO wiki_vec_index')) {
            return stmt({ run: vi.fn(() => ({ changes: 1, lastInsertRowid: 0 })) });
          }
          if (sql.includes('INSERT INTO wiki_versions')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const v = {
                  id: mockState.nextVersionId++,
                  entry_id: params[0],
                  version: params[1],
                  title: params[2],
                  content: params[3],
                  summary: params[4],
                  change_note: null,
                  created_at: String(Date.now()),
                };
                mockState.versions.push(v);
                return { changes: 1, lastInsertRowid: v.id };
              }),
            });
          }
          if (sql.includes('INSERT INTO wiki_links')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const link = {
                  id: mockState.nextLinkId++,
                  source_id: params[0],
                  target_id: params[1],
                  link_type: params[2],
                  weight: params[3],
                  created_at: String(Date.now()),
                };
                mockState.links.push(link);
                return { changes: 1, lastInsertRowid: link.id };
              }),
            });
          }
          if (sql.includes('INSERT INTO wiki_tags')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                const tag = {
                  id: mockState.nextTagId++,
                  name: params[0],
                  category: params[1],
                  description: params[2],
                  created_at: String(Date.now()),
                };
                mockState.tagDefs.push(tag);
                return { changes: 1, lastInsertRowid: tag.id };
              }),
            });
          }
          if (sql.includes('INSERT INTO wiki_entry_tags')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                mockState.entryTags.push({
                  entry_id: params[0],
                  tag_id: params[1],
                  created_at: String(Date.now()),
                });
                return { changes: 1, lastInsertRowid: 0 };
              }),
            });
          }
          if (sql.includes('INSERT INTO wiki_fts')) {
            return stmt({ run: vi.fn(() => ({ changes: 1, lastInsertRowid: 0 })) });
          }
          if (sql.includes('INSERT OR REPLACE INTO app_settings')) {
            return stmt({ run: vi.fn(() => ({ changes: 1, lastInsertRowid: 0 })) });
          }

          // ============ UPDATE ============
          if (sql.includes('UPDATE wiki_entries')) {
            return stmt({
              run: vi.fn((...params: unknown[]) => {
                // params: [title, content, summary, metadata, updated_at, id]
                const id = params[params.length - 1] as number;
                const idx = mockState.entries.findIndex((e) => e.id === id);
                if (idx >= 0) {
                  const cur = mockState.entries[idx];
                  mockState.entries[idx] = {
                    ...cur,
                    title: params[0] ?? cur.title,
                    content: params[1] ?? cur.content,
                    summary: params[2] ?? cur.summary,
                    metadata: params[3] ?? cur.metadata,
                    updated_at: String(Date.now()),
                  };
                  return { changes: 1, lastInsertRowid: 0 };
                }
                return ok;
              }),
            });
          }

          // ============ SELECT 单行 (get) ============
          if (sql.includes('SELECT * FROM wiki_entries WHERE id')) {
            return stmt({
              get: vi.fn((...params: unknown[]) => {
                const id = params[0] as number;
                return mockState.entries.find((e) => e.id === id);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_links WHERE id')) {
            return stmt({
              get: vi.fn((...params: unknown[]) => {
                const id = params[0] as number;
                return mockState.links.find((l) => l.id === id);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_tags WHERE name')) {
            return stmt({
              get: vi.fn((...params: unknown[]) => {
                const name = params[0] as string;
                return mockState.tagDefs.find((t) => t.name === name);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_tags WHERE id')) {
            return stmt({
              get: vi.fn((...params: unknown[]) => {
                const id = params[0] as number;
                return mockState.tagDefs.find((t) => t.id === id);
              }),
            });
          }
          if (sql.includes('SELECT MAX(version)')) {
            return stmt({
              get: vi.fn((...params: unknown[]) => {
                const entryId = params[0];
                const vers = mockState.versions.filter((v) => v.entry_id === entryId);
                const max = vers.reduce((m, v) => Math.max(m, v.version), 0);
                return { version: max || null };
              }),
            });
          }
          if (sql.includes('SELECT COUNT')) {
            return stmt({
              get: vi.fn(() => ({
                count: mockState.entries.length,
                total: mockState.entries.length,
                avg_length: mockState.entries.reduce(
                  (s, e) => s + String(e.content || '').length,
                  0,
                ) / Math.max(1, mockState.entries.length),
              })),
            });
          }

          // ============ SELECT 多行 (all) ============
          // 标签分布（stats）— 优先于 getEntryTags 的 JOIN
          if (sql.includes('COUNT(et.entry_id)')) {
            return stmt({
              all: vi.fn(() =>
                mockState.tagDefs.map((t) => ({
                  name: t.name,
                  count: mockState.entryTags.filter((et) => et.tag_id === t.id).length,
                })),
              ),
            });
          }
          // getEntryTags — JOIN wiki_tags / wiki_entry_tags
          if (sql.includes('WHERE et.entry_id')) {
            return stmt({
              all: vi.fn((...params: unknown[]) => {
                const entryId = params[0];
                const tagIds = mockState.entryTags
                  .filter((et) => et.entry_id === entryId)
                  .map((et) => et.tag_id);
                return mockState.tagDefs
                  .filter((t) => tagIds.includes(t.id))
                  .map((t) => ({ name: t.name }));
              }),
            });
          }
          // 来源分布（stats）
          if (sql.includes('SELECT source, COUNT(*) as count FROM wiki_entries')) {
            return stmt({
              all: vi.fn(() => {
                const map: Record<string, number> = {};
                for (const e of mockState.entries) {
                  map[e.source] = (map[e.source] || 0) + 1;
                }
                return Object.entries(map).map(([source, count]) => ({ source, count }));
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_versions WHERE entry_id')) {
            return stmt({
              all: vi.fn((...params: unknown[]) => {
                const entryId = params[0];
                return mockState.versions
                  .filter((v) => v.entry_id === entryId)
                  .sort((a, b) => b.version - a.version);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_links WHERE source_id')) {
            return stmt({
              all: vi.fn((...params: unknown[]) => {
                const sourceId = params[0];
                return mockState.links.filter((l) => l.source_id === sourceId);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_links WHERE target_id')) {
            return stmt({
              all: vi.fn((...params: unknown[]) => {
                const targetId = params[0];
                return mockState.links.filter((l) => l.target_id === targetId);
              }),
            });
          }
          if (sql.includes('SELECT * FROM wiki_entries')) {
            return stmt({
              all: vi.fn(() => mockState.entries),
            });
          }
          // FTS 全文搜索 — 返回带 rank 的条目（须在向量搜索之前匹配）
          if (sql.includes('wiki_fts MATCH')) {
            return stmt({
              all: vi.fn(() =>
                mockState.entries.map((e: any) => ({ ...e, rank: 0.5 })),
              ),
            });
          }
          // 向量搜索 — 返回带 distance 的条目
          if (sql.includes('SELECT e.id, e.title, e.content')) {
            return stmt({
              all: vi.fn(() =>
                mockState.entries.map((e: any) => ({ ...e, distance: 0.2 })),
              ),
            });
          }

          // 默认
          return stmt({});
        }),
        exec: vi.fn(),
        pragma: vi.fn(),
        transaction: vi.fn((fn: () => unknown) => fn()),
      }),
    },
  };
});

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