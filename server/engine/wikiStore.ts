/**
 * Wiki Store - Wiki 知识库存储引擎
 *
 * 基于 sqlite-vec 的 Wiki 条目存储，支持：
 * - wiki_entries 表（条目主表）
 * - wiki_versions 表（版本历史）
 * - wiki_links 表（条目关联）
 * - wiki_tags 表（标签系统）
 * - wiki_vec_index 表（向量索引）
 * - wiki_fts 表（全文搜索索引）
 *
 * 参考 OpenClaw memory-wiki 架构
 *
 * v10.0: 合并入向量库 vec_memory.db，使用 DatabaseManager 统一管理
 * - 不再使用独立 wiki_knowledge.db
 * - 通过 DatabaseManager.getVecDb() 获取向量库连接
 */

import { logger } from '../logger.js';
import { embedText, ONNX_EMBEDDING_DIMENSIONS } from './onnxEmbedding.js';
import { DatabaseManager } from '../storage/databaseManager.js';
import type {
  WikiEntry,
  WikiEntryCreateParams,
  WikiEntryUpdateParams,
  WikiVersion,
  WikiLink,
  WikiLinkCreateParams,
  WikiLinkType,
  WikiTag,
  WikiSearchResult,
  WikiStats,
  WikiSearchOptions,
} from './wikiTypes.js';

// ===================== 常量定义 =====================

/** 向量维度（all-MiniLM-L6-v2: 384 维） */
const VECTOR_DIMENSIONS = ONNX_EMBEDDING_DIMENSIONS;

/** 最大返回条目数 */
const DEFAULT_TOP_K = 10;

/** 混合搜索默认配置 */
const DEFAULT_HYBRID_SEARCH = {
  vectorWeight: 0.6,
  ftsWeight: 0.4,
  candidateMultiplier: 3,
};

/** MMR 去重默认配置 */
const DEFAULT_MMR = {
  lambda: 0.5,
};

// ===================== 数据库访问 =====================

function getDb() {
  return DatabaseManager.getVecDb();
}

// 延迟建表
setTimeout(() => {
  try {
    const db = getDb();

    // 1. wiki_entries 表（条目主表）
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_entries (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        title       TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        summary     TEXT,
        source      TEXT    DEFAULT 'manual',
        source_path TEXT,
        metadata    TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_entries_title ON wiki_entries(title);
      CREATE INDEX IF NOT EXISTS idx_wiki_entries_source ON wiki_entries(source);
    `);

    // 2. wiki_versions 表（版本历史）
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_versions (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id    INTEGER NOT NULL,
        version     INTEGER NOT NULL,
        title       TEXT    NOT NULL,
        content     TEXT    NOT NULL,
        summary     TEXT,
        change_note TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entry_id) REFERENCES wiki_entries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_versions_entry ON wiki_versions(entry_id);
    `);

    // 3. wiki_links 表（条目关联）
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_links (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id   INTEGER NOT NULL,
        target_id   INTEGER NOT NULL,
        link_type   TEXT    NOT NULL DEFAULT 'reference',
        weight      REAL    DEFAULT 1.0,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (source_id) REFERENCES wiki_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (target_id) REFERENCES wiki_entries(id) ON DELETE CASCADE,
        UNIQUE(source_id, target_id, link_type)
      );
      CREATE INDEX IF NOT EXISTS idx_wiki_links_source ON wiki_links(source_id);
      CREATE INDEX IF NOT EXISTS idx_wiki_links_target ON wiki_links(target_id);
    `);

    // 4. wiki_tags 表（标签）
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_tags (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT    NOT NULL UNIQUE,
        category    TEXT,
        description TEXT,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // 5. wiki_entry_tags 表（条目-标签关联）
    db.exec(`
      CREATE TABLE IF NOT EXISTS wiki_entry_tags (
        entry_id    INTEGER NOT NULL,
        tag_id      INTEGER NOT NULL,
        created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (entry_id) REFERENCES wiki_entries(id) ON DELETE CASCADE,
        FOREIGN KEY (tag_id) REFERENCES wiki_tags(id) ON DELETE CASCADE,
        PRIMARY KEY (entry_id, tag_id)
      );
    `);

    // 6. wiki_vec_index 表（向量索引） — 仅在表不存在时创建
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS wiki_vec_index USING vec0(
          embedding FLOAT32[${VECTOR_DIMENSIONS}] distance_metric=cosine
        );
      `);
    } catch (e) {
      logger.warn('[WikiStore] wiki_vec_index 创建跳过（可能已存在或 sqlite-vec 不可用）:', e instanceof Error ? e.message : String(e));
    }

    // 7. wiki_fts 表（全文搜索索引）
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS wiki_fts USING fts5(
        title,
        content,
        summary,
        content='wiki_entries',
        content_rowid='id',
        tokenize='unicode61'
      );
      CREATE TRIGGER IF NOT EXISTS wiki_fts_ai AFTER INSERT ON wiki_entries BEGIN
        INSERT INTO wiki_fts(rowid, title, content, summary) VALUES (new.id, new.title, new.content, COALESCE(new.summary, new.content));
      END;
      CREATE TRIGGER IF NOT EXISTS wiki_fts_ad AFTER DELETE ON wiki_entries BEGIN
        INSERT INTO wiki_fts(wiki_fts, rowid, title, content, summary) VALUES('delete', old.id, old.title, old.content, COALESCE(old.summary, old.content));
      END;
      CREATE TRIGGER IF NOT EXISTS wiki_fts_au AFTER UPDATE ON wiki_entries BEGIN
        INSERT INTO wiki_fts(wiki_fts, rowid, title, content, summary) VALUES('delete', old.id, old.title, old.content, COALESCE(old.summary, old.content));
        INSERT INTO wiki_fts(rowid, title, content, summary) VALUES (new.id, new.title, new.content, COALESCE(new.summary, new.content));
      END;
    `);

    // 版本标记
    db.exec(`CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)`);
    db.prepare(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('wiki_schema_version', ?)`).run('1.6.0');

    logger.debug('[WikiStore] 数据库 schema 初始化完成（向量库 vec_memory.db）');
  } catch (err) {
    logger.error('[WikiStore] 初始化 schema 失败:', err);
  }
}, 0);

// ===================== 条目 CRUD =====================

/**
 * 创建 Wiki 条目
 */
export async function createEntry(params: WikiEntryCreateParams): Promise<WikiEntry> {
  try {
    const db = getDb();

    const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;
    const result = db.prepare(
      `INSERT INTO wiki_entries (title, content, summary, source, source_path, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`
    ).run(params.title, params.content, params.summary || null, params.source || 'manual', params.sourcePath || null, metaJson);

    const id = Number(result.lastInsertRowid);

    // 生成向量嵌入
    const textToEmbed = params.summary || params.content;
    const embedding = await embedText(textToEmbed);
    const embeddingBuf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    db.prepare(`INSERT INTO wiki_vec_index (rowid, embedding) VALUES (?, ?)`).run(id, embeddingBuf);

    logger.debug(`[WikiStore] 创建条目: id=${id}, title="${params.title}"`);
    return getEntry(id)!;
  } catch (err) {
    logger.error('[WikiStore] 创建条目失败:', err);
    throw new Error(`创建条目失败: ${(err as Error).message}`);
  }
}

/**
 * 获取 Wiki 条目
 */
export function getEntry(id: number): WikiEntry | null {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM wiki_entries WHERE id = ?`).get(id) as {
      id: number;
      title: string;
      content: string;
      summary: string | null;
      source: string;
      source_path: string | null;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      summary: row.summary ?? undefined,
      source: row.source as WikiEntry['source'],
      sourcePath: row.source_path ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (err) {
    logger.error('[WikiStore] 获取条目失败:', err);
    return null;
  }
}

/**
 * 更新 Wiki 条目（自动创建版本历史）
 */
export async function updateEntry(params: WikiEntryUpdateParams): Promise<WikiEntry | null> {
  try {
    const db = getDb();

    const existing = getEntry(params.id);
    if (!existing) return null;

    // 创建版本历史
    const maxVersion = db.prepare(
      `SELECT MAX(version) as version FROM wiki_versions WHERE entry_id = ?`
    ).get(params.id) as { version: number | null } | undefined;
    const newVersion = (maxVersion?.version || 0) + 1;

    db.prepare(
      `INSERT INTO wiki_versions (entry_id, version, title, content, summary, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).run(params.id, newVersion, existing.title, existing.content, existing.summary);

    // 更新条目
    const newTitle = params.title || existing.title;
    const newContent = params.content || existing.content;
    const newSummary = params.summary || existing.summary;
    const newMetaJson = params.metadata ? JSON.stringify(params.metadata) : existing.metadata ? JSON.stringify(existing.metadata) : null;

    db.prepare(
      `UPDATE wiki_entries SET title = ?, content = ?, summary = ?, metadata = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(newTitle, newContent, newSummary, newMetaJson, params.id);

    // 更新向量嵌入
    const textToEmbed = newSummary || newContent;
    const embedding = await embedText(textToEmbed);
    const embeddingBuf = Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
    db.prepare(`DELETE FROM wiki_vec_index WHERE rowid = ?`).run(params.id);
    db.prepare(`INSERT INTO wiki_vec_index (rowid, embedding) VALUES (?, ?)`).run(params.id, embeddingBuf);

    logger.debug(`[WikiStore] 更新条目: id=${params.id}, version=${newVersion}`);
    return getEntry(params.id);
  } catch (err) {
    logger.error('[WikiStore] 更新条目失败:', err);
    throw new Error(`更新条目失败: ${(err as Error).message}`);
  }
}

/**
 * 删除 Wiki 条目
 */
export function deleteEntry(id: number): boolean {
  try {
    const db = getDb();

    // 删除向量索引
    db.prepare(`DELETE FROM wiki_vec_index WHERE rowid = ?`).run(id);

    // 删除条目（级联删除版本、链接、标签）
    const result = db.prepare(`DELETE FROM wiki_entries WHERE id = ?`).run(id);

    logger.debug(`[WikiStore] 删除条目: id=${id}`);
    return result.changes > 0;
  } catch (err) {
    logger.error('[WikiStore] 删除条目失败:', err);
    return false;
  }
}

/**
 * 获取条目版本历史
 */
export function getEntryVersions(entryId: number): WikiVersion[] {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM wiki_versions WHERE entry_id = ? ORDER BY version DESC`
    ).all(entryId) as Array<{
      id: number;
      entry_id: number;
      version: number;
      title: string;
      content: string;
      summary: string | null;
      change_note: string | null;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      entryId: row.entry_id,
      version: row.version,
      title: row.title,
      content: row.content,
      summary: row.summary ?? undefined,
      changeNote: row.change_note ?? undefined,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('[WikiStore] 获取版本历史失败:', err);
    return [];
  }
}

// ===================== 链接管理 =====================

/**
 * 创建条目链接
 */
export function createLink(params: WikiLinkCreateParams): WikiLink | null {
  try {
    const db = getDb();

    const result = db.prepare(
      `INSERT INTO wiki_links (source_id, target_id, link_type, weight, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`
    ).run(params.sourceId, params.targetId, params.linkType, params.weight || 1.0);

    const id = Number(result.lastInsertRowid);
    logger.debug(`[WikiStore] 创建链接: source=${params.sourceId}, target=${params.targetId}, type=${params.linkType}`);
    return getLink(id);
  } catch (err) {
    logger.error('[WikiStore] 创建链接失败:', err);
    return null;
  }
}

/**
 * 获取链接详情
 */
export function getLink(id: number): WikiLink | null {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM wiki_links WHERE id = ?`).get(id) as {
      id: number;
      source_id: number;
      target_id: number;
      link_type: string;
      weight: number;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      linkType: row.link_type as WikiLinkType,
      weight: row.weight,
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('[WikiStore] 获取链接失败:', err);
    return null;
  }
}

/**
 * 删除链接
 */
export function deleteLink(id: number): boolean {
  try {
    const db = getDb();
    const result = db.prepare(`DELETE FROM wiki_links WHERE id = ?`).run(id);
    return result.changes > 0;
  } catch (err) {
    logger.error('[WikiStore] 删除链接失败:', err);
    return false;
  }
}

/**
 * 获取条目的所有链接（出链）
 */
export function getEntryLinks(entryId: number): WikiLink[] {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM wiki_links WHERE source_id = ? ORDER BY weight DESC`
    ).all(entryId) as Array<{
      id: number;
      source_id: number;
      target_id: number;
      link_type: string;
      weight: number;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      linkType: row.link_type as WikiLinkType,
      weight: row.weight,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('[WikiStore] 获取条目链接失败:', err);
    return [];
  }
}

/**
 * 获取条目的反向链接（入链）
 */
export function getEntryBacklinks(entryId: number): WikiLink[] {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM wiki_links WHERE target_id = ? ORDER BY weight DESC`
    ).all(entryId) as Array<{
      id: number;
      source_id: number;
      target_id: number;
      link_type: string;
      weight: number;
      created_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      sourceId: row.source_id,
      targetId: row.target_id,
      linkType: row.link_type as WikiLinkType,
      weight: row.weight,
      createdAt: row.created_at,
    }));
  } catch (err) {
    logger.error('[WikiStore] 获取反向链接失败:', err);
    return [];
  }
}

// ===================== 标签管理 =====================

/**
 * 创建标签
 */
export function createTag(name: string, category?: string, description?: string): WikiTag | null {
  try {
    const db = getDb();

    const result = db.prepare(
      `INSERT INTO wiki_tags (name, category, description, created_at)
       VALUES (?, ?, ?, datetime('now'))`
    ).run(name, category || null, description || null);

    const id = Number(result.lastInsertRowid);
    logger.debug(`[WikiStore] 创建标签: name="${name}"`);
    return getTag(id);
  } catch (err) {
    logger.error('[WikiStore] 创建标签失败:', err);
    return null;
  }
}

/**
 * 获取标签详情
 */
export function getTag(id: number): WikiTag | null {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM wiki_tags WHERE id = ?`).get(id) as {
      id: number;
      name: string;
      category: string | null;
      description: string | null;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      category: row.category ?? undefined,
      description: row.description ?? undefined,
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('[WikiStore] 获取标签失败:', err);
    return null;
  }
}

/**
 * 根据名称获取标签
 */
export function getTagByName(name: string): WikiTag | null {
  try {
    const db = getDb();
    const row = db.prepare(`SELECT * FROM wiki_tags WHERE name = ?`).get(name) as {
      id: number;
      name: string;
      category: string | null;
      description: string | null;
      created_at: string;
    } | undefined;

    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      category: row.category ?? undefined,
      description: row.description ?? undefined,
      createdAt: row.created_at,
    };
  } catch (err) {
    logger.error('[WikiStore] 获取标签失败:', err);
    return null;
  }
}

/**
 * 为条目添加标签
 */
export function addTagToEntry(entryId: number, tagName: string): boolean {
  try {
    const db = getDb();

    // 获取或创建标签
    let tag = getTagByName(tagName);
    if (!tag) {
      tag = createTag(tagName);
      if (!tag) return false;
    }

    // 添加关联
    db.prepare(
      `INSERT INTO wiki_entry_tags (entry_id, tag_id, created_at)
       VALUES (?, ?, datetime('now'))`
    ).run(entryId, tag.id);

    logger.debug(`[WikiStore] 为条目 ${entryId} 添加标签 "${tagName}"`);
    return true;
  } catch (err) {
    logger.error('[WikiStore] 添加标签失败:', err);
    return false;
  }
}

/**
 * 移除条目标签
 */
export function removeTagFromEntry(entryId: number, tagName: string): boolean {
  try {
    const db = getDb();

    const tag = getTagByName(tagName);
    if (!tag) return false;

    const result = db.prepare(
      `DELETE FROM wiki_entry_tags WHERE entry_id = ? AND tag_id = ?`
    ).run(entryId, tag.id);

    return result.changes > 0;
  } catch (err) {
    logger.error('[WikiStore] 移除标签失败:', err);
    return false;
  }
}

/**
 * 获取条目的所有标签
 */
export function getEntryTags(entryId: number): string[] {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT t.name FROM wiki_tags t
       JOIN wiki_entry_tags et ON et.tag_id = t.id
       WHERE et.entry_id = ?`
    ).all(entryId) as Array<{ name: string }>;

    return rows.map(row => row.name);
  } catch (err) {
    logger.error('[WikiStore] 获取条目标签失败:', err);
    return [];
  }
}

// ===================== 搜索功能 =====================

/**
 * 向量搜索 Wiki 条目
 */
export async function vectorSearch(query: string, topK: number = DEFAULT_TOP_K): Promise<WikiSearchResult[]> {
  try {
    const db = getDb();

    const queryEmbedding = await embedText(query);
    const embeddingBuf = Buffer.from(queryEmbedding.buffer, queryEmbedding.byteOffset, queryEmbedding.byteLength);

    const rows = db.prepare(
      `SELECT e.id, e.title, e.content, e.summary, e.created_at, e.updated_at, v.distance
       FROM wiki_vec_index v
       JOIN wiki_entries e ON e.id = v.rowid
       WHERE v.embedding MATCH ?
       ORDER BY v.distance
       LIMIT ?`
    ).all(embeddingBuf, topK) as Array<{
      id: number;
      title: string;
      content: string;
      summary: string | null;
      distance: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      summary: row.summary || row.content.slice(0, 200),
      similarity: 1 - row.distance,
      matchSource: 'vector',
      tags: getEntryTags(row.id),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logger.error('[WikiStore] 向量搜索失败:', err);
    return [];
  }
}

/**
 * FTS 全文搜索 Wiki 条目
 */
export function ftsSearch(query: string, topK: number = DEFAULT_TOP_K): Promise<WikiSearchResult[]> {
  return new Promise((resolve) => {
    try {
      const db = getDb();

      const ftsQuery = query
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map(w => `"${w.replace(/"/g, '""')}"`)
        .join(' OR ');

      if (!ftsQuery) {
        resolve([]);
        return;
      }

      const rows = db.prepare(
        `SELECT e.id, e.title, e.content, e.summary, e.created_at, e.updated_at, f.rank
         FROM wiki_fts f
         JOIN wiki_entries e ON e.id = f.rowid
         WHERE wiki_fts MATCH ?
         ORDER BY f.rank
         LIMIT ?`
      ).all(ftsQuery, topK) as Array<{
        id: number;
        title: string;
        content: string;
        summary: string | null;
        rank: number;
        created_at: string;
        updated_at: string;
      }>;

      const results: WikiSearchResult[] = rows.map(row => ({
        id: row.id,
        title: row.title,
        summary: row.summary || row.content.slice(0, 200),
        similarity: Math.max(0, 1 - row.rank / 10),
        matchSource: 'fts',
        tags: getEntryTags(row.id),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));

      resolve(results);
    } catch (err) {
      logger.warn('[WikiStore] FTS 搜索失败:', err);
      resolve([]);
    }
  });
}

/**
 * 混合搜索 Wiki 条目（向量 + FTS）
 */
export async function hybridSearch(options: WikiSearchOptions): Promise<WikiSearchResult[]> {
  const {
    query,
    topK = DEFAULT_TOP_K,
    tags,
    source,
    useVectorSearch = true,
    useFtsSearch = true,
    vectorWeight = DEFAULT_HYBRID_SEARCH.vectorWeight,
    ftsWeight = DEFAULT_HYBRID_SEARCH.ftsWeight,
  } = options;
  const candidateMultiplier = options.candidateMultiplier ?? DEFAULT_HYBRID_SEARCH.candidateMultiplier;

  const candidateCount = topK * candidateMultiplier;

  const [vectorResults, ftsResults] = await Promise.allSettled([
    useVectorSearch ? vectorSearch(query, candidateCount) : Promise.resolve([]),
    useFtsSearch ? ftsSearch(query, candidateCount) : Promise.resolve([]),
  ]);

  // 合并结果
  const merged = new Map<number, { vectorScore: number; ftsScore: number; result: WikiSearchResult }>();

  if (vectorResults.status === 'fulfilled') {
    for (let i = 0; i < vectorResults.value.length; i++) {
      const r = vectorResults.value[i];
      const normalizedScore = 1 - i / vectorResults.value.length;
      merged.set(r.id, {
        vectorScore: Math.max(r.similarity, normalizedScore * 0.5),
        ftsScore: 0,
        result: r,
      });
    }
  }

  if (ftsResults.status === 'fulfilled') {
    for (let i = 0; i < ftsResults.value.length; i++) {
      const r = ftsResults.value[i];
      const normalizedScore = 1 - i / ftsResults.value.length;
      const existing = merged.get(r.id);
      if (existing) {
        existing.ftsScore = Math.max(r.similarity, normalizedScore);
      } else {
        merged.set(r.id, {
          vectorScore: 0,
          ftsScore: Math.max(r.similarity, normalizedScore),
          result: r,
        });
      }
    }
  }

  // 计算综合得分
  let scoredResults: WikiSearchResult[] = [];
  for (const entry of merged.values()) {
    const combinedScore = entry.vectorScore * vectorWeight + entry.ftsScore * ftsWeight;
    scoredResults.push({
      ...entry.result,
      similarity: combinedScore,
      matchSource: 'hybrid',
    });
  }

  // 排序
  scoredResults.sort((a, b) => b.similarity - a.similarity);

  // 应用过滤器
  if (tags && tags.length > 0) {
    scoredResults = scoredResults.filter(r =>
      r.tags && r.tags.some(t => tags.includes(t))
    );
  }

  if (source) {
    scoredResults = scoredResults.filter(r => {
      const entry = getEntry(r.id);
      return entry && entry.source === source;
    });
  }

  // 返回 topK
  const finalResults = scoredResults.slice(0, topK);

  logger.debug(
    `[WikiStore] 混合搜索: query="${query.slice(0, 50)}", ` +
    `vector=${vectorResults.status === 'fulfilled' ? vectorResults.value.length : 0}, ` +
    `fts=${ftsResults.status === 'fulfilled' ? ftsResults.value.length : 0}, ` +
    `final=${finalResults.length}`
  );

  return finalResults;
}

// ===================== 统计信息 =====================

/**
 * 获取 Wiki 统计信息
 */
export function getWikiStats(): WikiStats {
  try {
    const db = getDb();

    // 条目统计
    const entryStats = db.prepare(
      `SELECT COUNT(*) as total, COALESCE(AVG(LENGTH(content)), 0) as avg_length FROM wiki_entries`
    ).get() as { total: number; avg_length: number } | undefined;

    // 版本统计
    const versionStats = db.prepare(
      `SELECT COUNT(*) as total FROM wiki_versions`
    ).get() as { total: number } | undefined;

    // 链接统计
    const linkStats = db.prepare(
      `SELECT COUNT(*) as total FROM wiki_links`
    ).get() as { total: number } | undefined;

    // 标签统计
    const tagStats = db.prepare(
      `SELECT COUNT(*) as total FROM wiki_tags`
    ).get() as { total: number } | undefined;

    // 来源分布
    const sourceRows = db.prepare(
      `SELECT source, COUNT(*) as count FROM wiki_entries GROUP BY source`
    ).all() as Array<{ source: string; count: number }>;
    const sourceDistribution: Record<string, number> = {};
    for (const row of sourceRows) {
      sourceDistribution[row.source] = row.count;
    }

    // 标签分布（top 10）
    const tagRows = db.prepare(
      `SELECT t.name, COUNT(et.entry_id) as count
       FROM wiki_tags t
       LEFT JOIN wiki_entry_tags et ON et.tag_id = t.id
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT 10`
    ).all() as Array<{ name: string; count: number }>;
    const tagDistribution = tagRows.map(row => ({ name: row.name, count: row.count }));

    return {
      totalEntries: entryStats?.total ?? 0,
      totalVersions: versionStats?.total ?? 0,
      totalLinks: linkStats?.total ?? 0,
      totalTags: tagStats?.total ?? 0,
      avgContentLength: Math.round((entryStats?.avg_length ?? 0) * 100) / 100,
      sourceDistribution,
      tagDistribution,
    };
  } catch (err) {
    logger.error('[WikiStore] 获取统计失败:', err);
    return {
      totalEntries: 0,
      totalVersions: 0,
      totalLinks: 0,
      totalTags: 0,
      avgContentLength: 0,
      sourceDistribution: {},
      tagDistribution: [],
    };
  }
}

/**
 * 清空所有 Wiki 数据
 */
export function clearAllWiki(): boolean {
  try {
    const db = getDb();

    db.prepare(`DELETE FROM wiki_vec_index`).run();
    db.prepare(`DELETE FROM wiki_entry_tags`).run();
    db.prepare(`DELETE FROM wiki_links`).run();
    db.prepare(`DELETE FROM wiki_versions`).run();
    db.prepare(`DELETE FROM wiki_entries`).run();
    db.prepare(`DELETE FROM wiki_tags`).run();

    logger.info('[WikiStore] 清空所有 Wiki 数据');
    return true;
  } catch (err) {
    logger.error('[WikiStore] 清空 Wiki 数据失败:', err);
    return false;
  }
}

/**
 * 获取最近更新的条目
 */
export function getRecentEntries(limit: number = 10): WikiEntry[] {
  try {
    const db = getDb();
    const rows = db.prepare(
      `SELECT * FROM wiki_entries ORDER BY updated_at DESC LIMIT ?`
    ).all(limit) as Array<{
      id: number;
      title: string;
      content: string;
      summary: string | null;
      source: string;
      source_path: string | null;
      metadata: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      title: row.title,
      content: row.content,
      summary: row.summary ?? undefined,
      source: row.source as WikiEntry['source'],
      sourcePath: row.source_path ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logger.error('[WikiStore] 获取最近条目失败:', err);
    return [];
  }
}
