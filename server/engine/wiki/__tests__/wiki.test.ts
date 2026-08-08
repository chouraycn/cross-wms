/**
 * Wiki 模块单元测试
 *
 * 覆盖：
 * - WikiIndexer: Markdown 解析（标题/frontmatter/代码块/链接/摘要）、关键词提取、内容类型分析
 * - WikiStore: CRUD 操作（createEntry/getEntry/updateEntry/deleteEntry）
 * - WikiStore: 搜索功能（vectorSearch/hybridSearch 返回格式）
 *
 * 使用 mock 数据库和 mock embedding 隔离外部依赖，纯单元测试。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ===================== Mock Logger =====================

vi.mock('../../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ===================== Mock ONNX Embedding =====================

vi.mock('../../onnxEmbedding.js', () => ({
  embedText: vi.fn().mockResolvedValue(new Float32Array(384)),
  embedBatch: vi.fn().mockResolvedValue([new Float32Array(384)]),
  ONNX_EMBEDDING_DIMENSIONS: 384,
}));

// ===================== Mock Database =====================

const { wikiMock } = vi.hoisted(() => {
  // 内存数据存储
  const entries: Array<{
    id: number;
    title: string;
    content: string;
    summary: string | null;
    source: string;
    source_path: string | null;
    metadata: string | null;
    created_at: string;
    updated_at: string;
  }> = [];

  const versions: Array<{
    id: number;
    entry_id: number;
    version: number;
    title: string;
    content: string;
    summary: string | null;
    change_note: string | null;
    created_at: string;
  }> = [];

  const tags: Array<{
    id: number;
    name: string;
    category: string | null;
    description: string | null;
    created_at: string;
  }> = [];

  const entryTags: Array<{ entry_id: number; tag_id: number; created_at: string }> = [];

  let entryIdCounter = 0;
  let versionIdCounter = 0;
  let tagIdCounter = 0;

  function reset() {
    entries.length = 0;
    versions.length = 0;
    tags.length = 0;
    entryTags.length = 0;
    entryIdCounter = 0;
    versionIdCounter = 0;
    tagIdCounter = 0;
  }

  const mockDb = {
    exec: vi.fn(),
    prepare(sql: string) {
      const sqlLower = sql.toLowerCase();

      return {
        run: vi.fn((...params: any[]) => {
          // INSERT INTO wiki_entries
          if (/insert\s+into\s+wiki_entries/i.test(sql) && !/wiki_entry_tags/i.test(sql)) {
            const entry = {
              id: ++entryIdCounter,
              title: params[0] as string,
              content: params[1] as string,
              summary: params[2] as string | null,
              source: params[3] as string,
              source_path: params[4] as string | null,
              metadata: params[5] as string | null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };
            entries.push(entry);
            return { lastInsertRowid: entry.id, changes: 1 };
          }

          // INSERT INTO wiki_vec_index
          if (/insert\s+into\s+wiki_vec_index/i.test(sql)) {
            return { lastInsertRowid: 0, changes: 1 };
          }

          // INSERT INTO wiki_versions
          if (/insert\s+into\s+wiki_versions/i.test(sql)) {
            const version = {
              id: ++versionIdCounter,
              entry_id: params[0] as number,
              version: params[1] as number,
              title: params[2] as string,
              content: params[3] as string,
              summary: params[4] as string | null,
              change_note: null,
              created_at: new Date().toISOString(),
            };
            versions.push(version);
            return { lastInsertRowid: version.id, changes: 1 };
          }

          // INSERT INTO wiki_tags
          if (/insert\s+into\s+wiki_tags/i.test(sql)) {
            const tag = {
              id: ++tagIdCounter,
              name: params[0] as string,
              category: params[1] as string | null,
              description: params[2] as string | null,
              created_at: new Date().toISOString(),
            };
            tags.push(tag);
            return { lastInsertRowid: tag.id, changes: 1 };
          }

          // INSERT INTO wiki_entry_tags
          if (/insert\s+into\s+wiki_entry_tags/i.test(sql)) {
            entryTags.push({
              entry_id: params[0] as number,
              tag_id: params[1] as number,
              created_at: new Date().toISOString(),
            });
            return { changes: 1 };
          }

          // INSERT OR REPLACE INTO app_settings（setTimeout 初始化调用）
          if (/insert\s+(or\s+replace\s+)?into\s+app_settings/i.test(sql)) {
            return { changes: 1 };
          }

          // UPDATE wiki_entries SET ...
          if (/update\s+wiki_entries\s+set/i.test(sql)) {
            const id = params[4] as number;
            const entry = entries.find(e => e.id === id);
            if (entry) {
              entry.title = params[0] as string;
              entry.content = params[1] as string;
              entry.summary = params[2] as string | null;
              entry.metadata = params[3] as string | null;
              entry.updated_at = new Date().toISOString();
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // DELETE FROM wiki_vec_index WHERE rowid = ?
          if (/delete\s+from\s+wiki_vec_index/i.test(sql)) {
            return { changes: 1 };
          }

          // DELETE FROM wiki_entries WHERE id = ?
          if (/delete\s+from\s+wiki_entries/i.test(sql)) {
            const id = params[0] as number;
            const idx = entries.findIndex(e => e.id === id);
            if (idx >= 0) {
              entries.splice(idx, 1);
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // DELETE FROM wiki_entry_tags
          if (/delete\s+from\s+wiki_entry_tags/i.test(sql)) {
            const entryId = params[0] as number;
            const tagId = params[1] as number;
            const idx = entryTags.findIndex(et => et.entry_id === entryId && et.tag_id === tagId);
            if (idx >= 0) {
              entryTags.splice(idx, 1);
              return { changes: 1 };
            }
            return { changes: 0 };
          }

          // DELETE FROM wiki_links / wiki_versions / wiki_tags（clearAllWiki）
          if (/delete\s+from\s+wiki_(links|versions|tags)/i.test(sql)) {
            if (/wiki_versions/i.test(sql)) versions.length = 0;
            if (/wiki_tags/i.test(sql)) tags.length = 0;
            return { changes: 0 };
          }

          return { changes: 0, lastInsertRowid: 0 };
        }),

        get: vi.fn((...params: any[]) => {
          // SELECT * FROM wiki_entries WHERE id = ?
          if (/select\s+\*\s+from\s+wiki_entries\s+where\s+id/i.test(sql)) {
            return entries.find(e => e.id === params[0]) || undefined;
          }

          // SELECT MAX(version) as version FROM wiki_versions WHERE entry_id = ?
          if (/select\s+max\(version\)/i.test(sql)) {
            const entryId = params[0] as number;
            const entryVersions = versions.filter(v => v.entry_id === entryId);
            if (entryVersions.length === 0) return { version: null };
            return { version: Math.max(...entryVersions.map(v => v.version)) };
          }

          // SELECT * FROM wiki_tags WHERE id = ?
          if (/select\s+\*\s+from\s+wiki_tags\s+where\s+id/i.test(sql)) {
            return tags.find(t => t.id === params[0]) || undefined;
          }

          // SELECT * FROM wiki_tags WHERE name = ?
          if (/select\s+\*\s+from\s+wiki_tags\s+where\s+name/i.test(sql)) {
            return tags.find(t => t.name === params[0]) || undefined;
          }

          // Stats: SELECT COUNT(*) as total, ... FROM wiki_entries
          if (/select\s+count\(\*\)\s+as\s+total.*from\s+wiki_entries/i.test(sql)) {
            const avgLength = entries.length > 0
              ? entries.reduce((sum, e) => sum + e.content.length, 0) / entries.length
              : 0;
            return { total: entries.length, avg_length: avgLength };
          }

          // Stats: SELECT COUNT(*) as total FROM wiki_versions
          if (/select\s+count\(\*\)\s+as\s+total\s+from\s+wiki_versions/i.test(sql)) {
            return { total: versions.length };
          }

          // Stats: SELECT COUNT(*) as total FROM wiki_links
          if (/select\s+count\(\*\)\s+as\s+total\s+from\s+wiki_links/i.test(sql)) {
            return { total: 0 };
          }

          // Stats: SELECT COUNT(*) as total FROM wiki_tags
          if (/select\s+count\(\*\)\s+as\s+total\s+from\s+wiki_tags/i.test(sql)) {
            return { total: tags.length };
          }

          return undefined;
        }),

        all: vi.fn((...params: any[]) => {
          // SELECT * FROM wiki_versions WHERE entry_id = ? ORDER BY version DESC
          if (/select\s+\*\s+from\s+wiki_versions/i.test(sql)) {
            const entryId = params[0] as number;
            return versions
              .filter(v => v.entry_id === entryId)
              .sort((a, b) => b.version - a.version);
          }

          // Vector search: SELECT ... FROM wiki_vec_index v JOIN wiki_entries e ...
          if (/from\s+wiki_vec_index/i.test(sql)) {
            const topK = (params[1] as number) || 10;
            return entries.slice(0, topK).map(e => ({
              id: e.id,
              title: e.title,
              content: e.content,
              summary: e.summary,
              distance: 0.1,
              created_at: e.created_at,
              updated_at: e.updated_at,
            }));
          }

          // FTS search: SELECT ... FROM wiki_fts f JOIN wiki_entries e ...
          if (/from\s+wiki_fts/i.test(sql)) {
            const topK = (params[1] as number) || 10;
            return entries.slice(0, topK).map(e => ({
              id: e.id,
              title: e.title,
              content: e.content,
              summary: e.summary,
              rank: 0.5,
              created_at: e.created_at,
              updated_at: e.updated_at,
            }));
          }

          // Tag query: SELECT t.name FROM wiki_tags t JOIN wiki_entry_tags et ...
          if (/select\s+t\.name\s+from\s+wiki_tags/i.test(sql)) {
            const entryId = params[0] as number;
            const tagIds = entryTags
              .filter(et => et.entry_id === entryId)
              .map(et => et.tag_id);
            return tags
              .filter(t => tagIds.includes(t.id))
              .map(t => ({ name: t.name }));
          }

          // SELECT * FROM wiki_entries ORDER BY updated_at DESC LIMIT ?
          if (/select\s+\*\s+from\s+wiki_entries\s+order\s+by\s+updated_at/i.test(sql)) {
            const limit = (params[0] as number) || 10;
            return entries.slice(0, limit);
          }

          // Stats: SELECT source, COUNT(*) as count FROM wiki_entries GROUP BY source
          if (/select\s+source.*count\(\*\)\s+as\s+count\s+from\s+wiki_entries\s+group\s+by\s+source/i.test(sql)) {
            const dist: Record<string, number> = {};
            for (const e of entries) {
              dist[e.source] = (dist[e.source] || 0) + 1;
            }
            return Object.entries(dist).map(([source, count]) => ({ source, count }));
          }

          // Stats: SELECT t.name, COUNT(et.entry_id) as count FROM wiki_tags ...
          if (/select\s+t\.name.*count\(et\.entry_id\)/i.test(sql)) {
            return tags.slice(0, 10).map(t => ({
              name: t.name,
              count: entryTags.filter(et => et.tag_id === t.id).length,
            }));
          }

          return [];
        }),
      };
    },
  };

  return {
    wikiMock: {
      db: mockDb,
      reset,
      entries,
      versions,
      tags,
      entryTags,
    },
  };
});

// ===================== Mock DatabaseManager =====================

vi.mock('../../../storage/databaseManager.js', () => ({
  DatabaseManager: {
    getVecDb: () => wikiMock.db,
  },
}));

// ===================== 导入被测模块 =====================

import { parseMarkdown, extractKeywords, analyzeContentType, generateSummary } from '../../wikiIndexer.js';
import {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  getEntryVersions,
  vectorSearch,
  hybridSearch,
  getWikiStats,
} from '../../wikiStore.js';
import type { WikiSearchResult } from '../../wikiTypes.js';

// ===================== Markdown 解析测试 =====================

describe('WikiIndexer - Markdown 解析', () => {
  describe('parseMarkdown', () => {
    it('从 # 标题提取标题', () => {
      const md = '# WMS 库存管理指南\n\n这是正文内容。';
      const result = parseMarkdown(md);
      expect(result.title).toBe('WMS 库存管理指南');
      expect(result.content).not.toContain('# WMS 库存管理指南');
    });

    it('无标题时返回 Untitled', () => {
      const md = '这是没有标题的正文。';
      const result = parseMarkdown(md);
      expect(result.title).toBe('Untitled');
    });

    it('解析 YAML frontmatter', () => {
      const md = '---\ntitle: "自定义标题"\ntags: [wms, inventory]\n---\n\n# 正文标题\n\n正文内容';
      const result = parseMarkdown(md);
      expect(result.title).toBe('自定义标题');
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.title).toBe('自定义标题');
      expect(result.metadata?.tags).toEqual(['wms', 'inventory']);
    });

    it('从 frontmatter 提取字符串标签', () => {
      const md = '---\ntags: wms, inventory, logistics\n---\n\n# 标题\n\n正文';
      const result = parseMarkdown(md);
      expect(result.tags).toContain('wms');
      expect(result.tags).toContain('inventory');
      expect(result.tags).toContain('logistics');
    });

    it('提取代码块', () => {
      const md = '# 标题\n\n```typescript\nconst x = 1;\n```\n\n正文';
      const result = parseMarkdown(md);
      expect(result.codeBlocks).toBeDefined();
      expect(result.codeBlocks!.length).toBe(1);
      expect(result.codeBlocks![0].language).toBe('typescript');
      expect(result.codeBlocks![0].code).toBe('const x = 1;');
    });

    it('提取无语言标记的代码块', () => {
      const md = '# 标题\n\n```\nplain text\n```\n';
      const result = parseMarkdown(md);
      expect(result.codeBlocks!.length).toBe(1);
      expect(result.codeBlocks![0].language).toBe('text');
    });

    it('提取链接', () => {
      const md = '# 标题\n\n[Google](https://google.com) 和 [GitHub](https://github.com)';
      const result = parseMarkdown(md);
      expect(result.links).toBeDefined();
      expect(result.links!.length).toBe(2);
      expect(result.links![0].text).toBe('Google');
      expect(result.links![0].url).toBe('https://google.com');
      expect(result.links![1].text).toBe('GitHub');
      expect(result.links![1].url).toBe('https://github.com');
    });

    it('生成摘要（前 200 字）', () => {
      const longText = 'A'.repeat(300);
      const md = `# 标题\n\n${longText}`;
      const result = parseMarkdown(md);
      expect(result.summary).toBeDefined();
      expect(result.summary!.length).toBeLessThanOrEqual(200);
    });

    it('去除 Markdown 标记生成纯文本摘要', () => {
      const md = '# 标题\n\n**粗体** 和 *斜体* 和 `代码`';
      const result = parseMarkdown(md);
      expect(result.summary).not.toContain('**');
      expect(result.summary).not.toContain('*');
      expect(result.summary).not.toContain('`');
    });

    it('处理空字符串', () => {
      const result = parseMarkdown('');
      expect(result.title).toBe('Untitled');
      expect(result.content).toBe('');
      expect(result.tags).toEqual([]);
    });
  });

  describe('extractKeywords', () => {
    it('提取英文单词', () => {
      const text = 'The React framework is great for building user interfaces';
      const keywords = extractKeywords(text);
      expect(keywords).toContain('React');
      expect(keywords).toContain('framework');
    });

    it('提取技术术语并优先排列', () => {
      const text = 'We use Docker and Kubernetes for deployment. The API uses JWT for authentication.';
      const keywords = extractKeywords(text);
      // 技术术语应排在前面
      expect(keywords).toContain('Docker');
      expect(keywords).toContain('Kubernetes');
      expect(keywords).toContain('API');
      expect(keywords).toContain('JWT');
      // Docker 和 Kubernetes 应排在普通词前面
      const dockerIdx = keywords.indexOf('Docker');
      const deployIdx = keywords.indexOf('deployment');
      if (deployIdx >= 0) {
        expect(dockerIdx).toBeLessThan(deployIdx);
      }
    });

    it('过滤英文停用词', () => {
      const text = 'the and for are but not you all can had';
      const keywords = extractKeywords(text);
      // 所有停用词都应被过滤（长度 < 3 或在停用词表中）
      expect(keywords).not.toContain('the');
      expect(keywords).not.toContain('and');
      expect(keywords).not.toContain('for');
    });

    it('过滤短词（长度 < 3）', () => {
      const text = 'a b cd efg abcd';
      const keywords = extractKeywords(text);
      expect(keywords).not.toContain('a');
      expect(keywords).not.toContain('b');
      expect(keywords).not.toContain('cd');
      expect(keywords).toContain('efg');
      expect(keywords).toContain('abcd');
    });

    it('尊重 maxCount 限制', () => {
      const text = 'JavaScript TypeScript Python Java Go Rust Docker Kubernetes API HTTP JSON SQL React Vue Angular Node Express Koa Redis MongoDB MySQL PostgreSQL';
      const keywords = extractKeywords(text, 5);
      expect(keywords.length).toBeLessThanOrEqual(5);
    });

    it('提取中文关键词（xxx系统 模式）', () => {
      // \w+ 匹配拉丁字符，后接中文后缀（如 WMS系统、API模块、UI组件）
      const text = '我们使用 WMS系统 进行库存管理，通过 API模块 对接外部服务，前端使用 UI组件 渲染界面';
      const keywords = extractKeywords(text);
      expect(keywords.some(k => k.includes('系统'))).toBe(true);
      expect(keywords.some(k => k.includes('模块'))).toBe(true);
      expect(keywords.some(k => k.includes('组件'))).toBe(true);
    });

    it('去重关键词', () => {
      const text = 'API API API Docker Docker';
      const keywords = extractKeywords(text);
      const apiCount = keywords.filter(k => k.toLowerCase() === 'api').length;
      expect(apiCount).toBe(1);
    });

    it('空文本返回空数组', () => {
      const keywords = extractKeywords('');
      expect(keywords).toEqual([]);
    });
  });

  describe('analyzeContentType', () => {
    it('识别 API 文档', () => {
      const result = analyzeContentType({
        id: 1,
        title: 'API Reference',
        content: 'This endpoint returns data. The request requires authentication.',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('api');
    });

    it('识别配置文档', () => {
      const result = analyzeContentType({
        id: 1,
        title: '系统配置',
        content: 'Environment variables and settings',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('config');
    });

    it('识别教程', () => {
      const result = analyzeContentType({
        id: 1,
        title: 'Getting Started Tutorial',
        content: 'How to use this system',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('tutorial');
    });

    it('识别参考文档', () => {
      const result = analyzeContentType({
        id: 1,
        title: 'Reference Documentation',
        content: '详细参考文档',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('reference');
    });

    it('识别代码示例', () => {
      const result = analyzeContentType({
        id: 1,
        title: '示例',
        content: '```\nfunction hello() { return "world"; }\n```\n这是一个 class 定义',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('code');
    });

    it('默认为 general 类型', () => {
      const result = analyzeContentType({
        id: 1,
        title: '杂项笔记',
        content: '一些随机笔记内容',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('general');
    });
  });

  describe('generateSummary', () => {
    it('已有摘要时直接返回', () => {
      const result = generateSummary({
        id: 1,
        title: '标题',
        content: '正文',
        summary: '已有摘要',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toBe('已有摘要');
    });

    it('无摘要时从内容生成', () => {
      const result = generateSummary({
        id: 1,
        title: '标题',
        content: '这是正文内容，用于生成摘要。',
        createdAt: '',
        updatedAt: '',
      });
      expect(result).toContain('这是正文内容');
    });

    it('长内容截断为 200 字', () => {
      const longContent = 'A'.repeat(300);
      const result = generateSummary({
        id: 1,
        title: '标题',
        content: longContent,
        createdAt: '',
        updatedAt: '',
      });
      expect(result.length).toBeLessThanOrEqual(203); // 200 + '...'
      expect(result.endsWith('...')).toBe(true);
    });
  });
});

// ===================== CRUD 操作测试 =====================

describe('WikiStore - CRUD 操作', () => {
  beforeEach(() => {
    wikiMock.reset();
  });

  describe('createEntry / getEntry', () => {
    it('创建条目并获取', async () => {
      const created = await createEntry({
        title: 'WMS 库存管理',
        content: '这是库存管理的内容',
        summary: '库存管理摘要',
      });

      expect(created.id).toBeGreaterThan(0);
      expect(created.title).toBe('WMS 库存管理');
      expect(created.content).toBe('这是库存管理的内容');
      expect(created.summary).toBe('库存管理摘要');
      expect(created.source).toBe('manual');
      expect(created.createdAt).toBeTruthy();
      expect(created.updatedAt).toBeTruthy();

      const retrieved = getEntry(created.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.id).toBe(created.id);
      expect(retrieved!.title).toBe('WMS 库存管理');
    });

    it('创建条目时支持自定义来源', async () => {
      const created = await createEntry({
        title: '导入文档',
        content: '内容',
        source: 'markdown',
        sourcePath: '/path/to/file.md',
      });

      expect(created.source).toBe('markdown');
      expect(created.sourcePath).toBe('/path/to/file.md');
    });

    it('创建条目时支持元数据', async () => {
      const created = await createEntry({
        title: '带元数据的条目',
        content: '内容',
        metadata: { author: 'test', priority: 'high' },
      });

      expect(created.metadata).toBeDefined();
      expect(created.metadata?.author).toBe('test');
      expect(created.metadata?.priority).toBe('high');
    });

    it('获取不存在的条目返回 null', () => {
      const result = getEntry(99999);
      expect(result).toBeNull();
    });
  });

  describe('updateEntry', () => {
    it('更新条目标题和内容', async () => {
      const created = await createEntry({
        title: '原始标题',
        content: '原始内容',
      });

      const updated = await updateEntry({
        id: created.id,
        title: '更新后标题',
        content: '更新后内容',
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('更新后标题');
      expect(updated!.content).toBe('更新后内容');
    });

    it('更新条目时创建版本历史', async () => {
      const created = await createEntry({
        title: '原始标题',
        content: '原始内容',
        summary: '原始摘要',
      });

      await updateEntry({
        id: created.id,
        title: '更新标题',
        content: '更新内容',
      });

      const versions = getEntryVersions(created.id);
      expect(versions.length).toBe(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].title).toBe('原始标题');
      expect(versions[0].content).toBe('原始内容');
    });

    it('多次更新递增版本号', async () => {
      const created = await createEntry({
        title: '标题',
        content: '内容',
      });

      await updateEntry({ id: created.id, title: 'v2' });
      await updateEntry({ id: created.id, title: 'v3' });

      const versions = getEntryVersions(created.id);
      expect(versions.length).toBe(2);
      expect(versions[0].version).toBe(2);
      expect(versions[1].version).toBe(1);
    });

    it('更新不存在的条目返回 null', async () => {
      const result = await updateEntry({
        id: 99999,
        title: '不存在',
      });
      expect(result).toBeNull();
    });

    it('部分更新（仅更新摘要）', async () => {
      const created = await createEntry({
        title: '标题',
        content: '内容',
      });

      const updated = await updateEntry({
        id: created.id,
        summary: '新摘要',
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('标题');
      expect(updated!.content).toBe('内容');
      expect(updated!.summary).toBe('新摘要');
    });
  });

  describe('deleteEntry', () => {
    it('删除存在的条目', async () => {
      const created = await createEntry({
        title: '待删除',
        content: '内容',
      });

      const result = deleteEntry(created.id);
      expect(result).toBe(true);

      const retrieved = getEntry(created.id);
      expect(retrieved).toBeNull();
    });

    it('删除不存在的条目返回 false', () => {
      const result = deleteEntry(99999);
      expect(result).toBe(false);
    });
  });

  describe('getEntryVersions', () => {
    it('无版本历史返回空数组', async () => {
      const created = await createEntry({
        title: '标题',
        content: '内容',
      });

      const versions = getEntryVersions(created.id);
      expect(versions).toEqual([]);
    });

    it('按版本号降序返回', async () => {
      const created = await createEntry({
        title: '标题',
        content: '内容',
      });

      await updateEntry({ id: created.id, title: 'v2' });
      await updateEntry({ id: created.id, title: 'v3' });

      const versions = getEntryVersions(created.id);
      expect(versions.length).toBe(2);
      expect(versions[0].version).toBeGreaterThan(versions[1].version);
    });
  });
});

// ===================== 搜索功能测试 =====================

describe('WikiStore - 搜索功能', () => {
  beforeEach(async () => {
    wikiMock.reset();
    // 创建测试数据
    await createEntry({ title: 'WMS 库存管理', content: '库存管理系统的核心功能', summary: '库存管理摘要' });
    await createEntry({ title: '订单处理流程', content: '订单从创建到发货的完整流程', summary: '订单处理摘要' });
    await createEntry({ title: 'API 接口文档', content: 'RESTful API 设计规范', summary: 'API 文档摘要' });
  });

  describe('vectorSearch', () => {
    it('返回正确格式的搜索结果', async () => {
      const results = await vectorSearch('库存管理', 10);

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(typeof result.id).toBe('number');
        expect(result.title).toBeDefined();
        expect(typeof result.title).toBe('string');
        expect(result.similarity).toBeDefined();
        expect(typeof result.similarity).toBe('number');
        expect(result.matchSource).toBe('vector');
        expect(Array.isArray(result.tags)).toBe(true);
      }
    });

    it('similarity 在 0-1 范围内', async () => {
      const results = await vectorSearch('测试', 10);
      for (const result of results) {
        expect(result.similarity).toBeGreaterThanOrEqual(0);
        expect(result.similarity).toBeLessThanOrEqual(1);
      }
    });

    it('matchSource 为 vector', async () => {
      const results = await vectorSearch('测试', 5);
      for (const result of results) {
        expect(result.matchSource).toBe('vector');
      }
    });

    it('topK 限制返回数量', async () => {
      const results = await vectorSearch('测试', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });
  });

  describe('hybridSearch', () => {
    it('返回正确格式的混合搜索结果', async () => {
      const results = await hybridSearch({
        query: '库存管理',
        topK: 10,
      });

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      for (const result of results) {
        expect(result.id).toBeDefined();
        expect(result.title).toBeDefined();
        expect(result.similarity).toBeDefined();
        expect(result.matchSource).toBe('hybrid');
      }
    });

    it('matchSource 为 hybrid', async () => {
      const results = await hybridSearch({
        query: '订单',
        topK: 5,
      });

      for (const result of results) {
        expect(result.matchSource).toBe('hybrid');
      }
    });

    it('topK 限制返回数量', async () => {
      const results = await hybridSearch({
        query: '测试',
        topK: 2,
      });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('仅使用向量搜索时返回结果', async () => {
      const results = await hybridSearch({
        query: '库存',
        topK: 10,
        useVectorSearch: true,
        useFtsSearch: false,
      });

      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.matchSource).toBe('hybrid');
      }
    });

    it('仅使用全文搜索时返回结果', async () => {
      const results = await hybridSearch({
        query: 'API',
        topK: 10,
        useVectorSearch: false,
        useFtsSearch: true,
      });

      expect(results.length).toBeGreaterThan(0);
    });

    it('结果按相似度降序排列', async () => {
      const results = await hybridSearch({
        query: '管理',
        topK: 10,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i].similarity).toBeLessThanOrEqual(results[i - 1].similarity);
      }
    });
  });
});

// ===================== 统计信息测试 =====================

describe('WikiStore - 统计信息', () => {
  beforeEach(async () => {
    wikiMock.reset();
    await createEntry({ title: '条目1', content: '内容1', source: 'manual' });
    await createEntry({ title: '条目2', content: '内容2', source: 'markdown' });
  });

  it('getWikiStats 返回正确格式', () => {
    const stats = getWikiStats();

    expect(stats.totalEntries).toBe(2);
    expect(typeof stats.totalVersions).toBe('number');
    expect(typeof stats.totalLinks).toBe('number');
    expect(typeof stats.totalTags).toBe('number');
    expect(typeof stats.avgContentLength).toBe('number');
    expect(stats.sourceDistribution).toBeDefined();
    expect(typeof stats.sourceDistribution).toBe('object');
    expect(Array.isArray(stats.tagDistribution)).toBe(true);
  });

  it('sourceDistribution 反映来源分布', () => {
    const stats = getWikiStats();
    expect(stats.sourceDistribution['manual']).toBe(1);
    expect(stats.sourceDistribution['markdown']).toBe(1);
  });
});
