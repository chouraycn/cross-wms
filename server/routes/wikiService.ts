/**
 * Wiki 知识库 REST API
 *
 * 提供：
 * - GET    /api/wiki/recent              — 获取最近条目
 * - GET    /api/wiki/stats               — 获取统计信息
 * - POST   /api/wiki/search              — 搜索知识库
 * - GET    /api/wiki/entry/:id           — 获取条目详情
 * - POST   /api/wiki/entry               — 创建条目
 * - PUT    /api/wiki/entry/:id           — 更新条目
 * - DELETE /api/wiki/entry/:id           — 删除条目
 * - GET    /api/wiki/entry/:id/tags      — 获取条目标签
 * - POST   /api/wiki/entry/:id/tags      — 添加标签
 * - DELETE /api/wiki/entry/:id/tags/:tag — 移除标签
 * - GET    /api/wiki/entry/:id/versions  — 获取版本历史
 * - GET    /api/wiki/tags                — 获取所有标签
 */

import { Router } from 'express';
import {
  createEntry,
  getEntry,
  updateEntry,
  deleteEntry,
  getEntryTags,
  addTagToEntry,
  removeTagFromEntry,
  hybridSearch,
  getWikiStats,
  getRecentEntries,
  getEntryVersions,
} from '../engine/wikiStore.js';
import type { WikiEntryCreateParams, WikiEntryUpdateParams, WikiSearchOptions } from '../engine/wikiTypes.js';

const router = Router();

/**
 * GET /api/wiki/stats
 * 获取 Wiki 统计信息
 */
router.get('/stats', (_req, res) => {
  try {
    const stats = getWikiStats();
    res.json({ stats });
  } catch (e) {
    res.status(500).json({
      error: `获取统计失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/wiki/recent
 * 获取最近条目
 */
router.get('/recent', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string || '10', 10);
    const entries = getRecentEntries(Math.min(limit, 50));
    res.json({ entries });
  } catch (e) {
    res.status(500).json({
      error: `获取最近条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/wiki/search
 * 搜索知识库
 */
router.post('/search', async (req, res) => {
  try {
    const { query, topK, tags, source, useVectorSearch, useFtsSearch } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'query 不能为空' });
    }

    const options: WikiSearchOptions = {
      query,
      topK: topK ? Math.min(parseInt(topK, 10), 50) : 10,
      tags: Array.isArray(tags) ? tags : undefined,
      source: source as WikiSearchOptions['source'],
      useVectorSearch: useVectorSearch !== false,
      useFtsSearch: useFtsSearch !== false,
    };

    const results = await hybridSearch(options);
    res.json({ results });
  } catch (e) {
    res.status(500).json({
      error: `搜索失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/wiki/entry/:id
 * 获取条目详情
 */
router.get('/entry/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const entry = getEntry(id);

    if (!entry) {
      return res.status(404).json({ error: '条目不存在' });
    }

    res.json({ entry });
  } catch (e) {
    res.status(500).json({
      error: `获取条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/wiki/entry
 * 创建条目
 */
router.post('/entry', async (req, res) => {
  try {
    const { title, content, summary, source, tags } = req.body;

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'title 不能为空' });
    }

    if (!content || typeof content !== 'string') {
      return res.status(400).json({ error: 'content 不能为空' });
    }

    const params: WikiEntryCreateParams = {
      title,
      content,
      summary,
      source: source || 'manual',
      autoExtractTags: true,
    };

    const entry = await createEntry(params);

    if (Array.isArray(tags) && tags.length > 0) {
      for (const tag of tags) {
        if (typeof tag === 'string' && tag.trim()) {
          addTagToEntry(entry.id, tag.trim());
        }
      }
    }

    res.json({ entry });
  } catch (e) {
    res.status(500).json({
      error: `创建条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * PUT /api/wiki/entry/:id
 * 更新条目
 */
router.put('/entry/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const existing = getEntry(id);
    if (!existing) {
      return res.status(404).json({ error: '条目不存在' });
    }

    const { title, content, summary, tags } = req.body;

    const params: WikiEntryUpdateParams = {
      id,
      title,
      content,
      summary,
    };

    const updated = await updateEntry(params);

    if (Array.isArray(tags)) {
      const oldTags = getEntryTags(id);
      const newTags = tags.filter((t: string) => t && typeof t === 'string').map((t: string) => t.trim());

      for (const oldTag of oldTags) {
        if (!newTags.includes(oldTag)) {
          removeTagFromEntry(id, oldTag);
        }
      }

      for (const newTag of newTags) {
        if (!oldTags.includes(newTag)) {
          addTagToEntry(id, newTag);
        }
      }
    }

    res.json({ entry: updated });
  } catch (e) {
    res.status(500).json({
      error: `更新条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * DELETE /api/wiki/entry/:id
 * 删除条目
 */
router.delete('/entry/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const success = deleteEntry(id);

    if (!success) {
      return res.status(404).json({ error: '条目不存在' });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({
      error: `删除条目失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/wiki/entry/:id/tags
 * 获取条目标签
 */
router.get('/entry/:id/tags', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const tags = getEntryTags(id);
    res.json({ tags });
  } catch (e) {
    res.status(500).json({
      error: `获取标签失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/wiki/entry/:id/tags
 * 添加标签
 */
router.post('/entry/:id/tags', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tag } = req.body;

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    if (!tag || typeof tag !== 'string') {
      return res.status(400).json({ error: 'tag 不能为空' });
    }

    const success = addTagToEntry(id, tag.trim());
    res.json({ success });
  } catch (e) {
    res.status(500).json({
      error: `添加标签失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * DELETE /api/wiki/entry/:id/tags/:tag
 * 移除标签
 */
router.delete('/entry/:id/tags/:tag', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { tag } = req.params;

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const success = removeTagFromEntry(id, tag);
    res.json({ success });
  } catch (e) {
    res.status(500).json({
      error: `移除标签失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/wiki/entry/:id/versions
 * 获取版本历史
 */
router.get('/entry/:id/versions', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      return res.status(400).json({ error: '无效的 id' });
    }

    const versions = getEntryVersions(id);
    res.json({ versions });
  } catch (e) {
    res.status(500).json({
      error: `获取版本历史失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * GET /api/wiki/tags
 * 获取所有标签
 */
router.get('/tags', (req, res) => {
  try {
    const stats = getWikiStats();
    res.json({ tags: stats.tagDistribution });
  } catch (e) {
    res.status(500).json({
      error: `获取标签失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

/**
 * POST /api/wiki/import/markdown
 * 导入 Markdown 文件
 */
router.post('/import/markdown', async (req, res) => {
  try {
    const { path } = req.body;

    if (!path || typeof path !== 'string') {
      return res.status(400).json({ error: 'path 不能为空' });
    }

    // 简化实现：从文件读取内容并创建条目
    const fs = await import('fs/promises');
    const content = await fs.readFile(path, 'utf-8');
    
    // 从文件名提取标题
    const title = path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled';
    
    const params: WikiEntryCreateParams = {
      title,
      content,
      source: 'markdown',
      sourcePath: path,
      autoExtractTags: true,
    };

    const entry = await createEntry(params);
    res.json({ success: true, entry });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: `导入失败: ${e instanceof Error ? e.message : String(e)}`,
    });
  }
});

export default router;
