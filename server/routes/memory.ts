import { Router } from 'express';
import { readMemoryMd, writeMemoryMd } from './memoryExtractor.js';
import {
  searchMemory,
  getMemoryStats,
  backfillEmbeddings,
  getRecentMemories,
  insertMemory,
  deleteMemory,
  getMemory,
  updateMemory,
  batchDeleteMemories,
  batchUpdateCategory,
  hybridSearchMemory,
} from '../engine/vecMemoryStore.js';
import { logger } from '../logger.js';

const router = Router();

// 读取 MEMORY.md
router.get('/', async (_req, res) => {
  try {
    const content = await readMemoryMd();
    res.json({ content });
  } catch (e) {
    logger.error('[Memory API] 读取失败:', e);
    res.status(500).json({ error: '读取失败' });
  }
});

// 更新 MEMORY.md
router.post('/', async (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content must be a string' });
    return;
  }
  try {
    await writeMemoryMd(content);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '写入失败' });
  }
});

// v8.6: 语义记忆搜索
router.get('/search', async (req, res) => {
  const query = (req.query.query as string) || '';
  const topK = parseInt(req.query.topK as string) || 5;
  const threshold = parseFloat(req.query.threshold as string) || 0.35;

  if (!query.trim()) {
    res.status(400).json({ error: 'query is required' });
    return;
  }

  try {
    const results = await searchMemory(query, topK);
    res.json({ results });
  } catch (e) {
    logger.error('[Memory API] 语义搜索失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v8.6: 记忆存储状态
router.get('/stats', (_req, res) => {
  try {
    const stats = getMemoryStats();
    res.json(stats);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// v8.6: 批量回填 embedding（从旧版升级时调用）
router.post('/backfill', async (_req, res) => {
  try {
    const result = await backfillEmbeddings();
    res.json(result);
  } catch (e) {
    logger.error('[Memory API] embedding 回填失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.0: 获取记忆列表（分页）
router.get('/list', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const offset = parseInt(req.query.offset as string) || 0;

  try {
    const allMemories = getRecentMemories(limit + offset);
    const memories = allMemories.slice(offset, offset + limit);
    const total = allMemories.length;

    res.json({
      memories,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });
  } catch (e) {
    logger.error('[Memory API] 获取记忆列表失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.0: 添加记忆
router.post('/add', async (req, res) => {
  const { text, metadata, category, importance } = req.body;

  if (!text || typeof text !== 'string') {
    res.status(400).json({ error: 'text is required and must be a string' });
    return;
  }

  try {
    const id = await insertMemory(
      text,
      metadata || {},
      typeof category === 'string' ? category : undefined,
      typeof importance === 'number' ? importance : undefined
    );
    res.json({ id, success: true });
  } catch (e) {
    logger.error('[Memory API] 添加记忆失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.1: 更新记忆（分类 / 重要性 / 文本 / 元数据）— 富面板 MemoryPanel 编辑能力
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { text, metadata, category, importance } = req.body;

  if (!id || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  try {
    const success = updateMemory(id, {
      ...(typeof text === 'string' ? { text } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
      ...(typeof category === 'string' ? { category } : {}),
      ...(typeof importance === 'number' ? { importance } : {}),
    });
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'memory not found' });
    }
  } catch (e) {
    logger.error('[Memory API] 更新记忆失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.1: 批量删除记忆 — 富面板 MemoryPanel 批量操作
router.post('/batch-delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids must be an array' });
    return;
  }
  try {
    const deleted = batchDeleteMemories(ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n)));
    res.json({ success: true, deleted });
  } catch (e) {
    logger.error('[Memory API] 批量删除记忆失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.1: 批量更新记忆分类 — 富面板 MemoryPanel 批量操作
router.post('/batch-category', (req, res) => {
  const { ids, category } = req.body;
  if (!Array.isArray(ids) || typeof category !== 'string') {
    res.status(400).json({ error: 'ids must be an array and category must be a string' });
    return;
  }
  try {
    const updated = batchUpdateCategory(ids.map((x: unknown) => Number(x)).filter((n: number) => Number.isFinite(n)), category);
    res.json({ success: true, updated });
  } catch (e) {
    logger.error('[Memory API] 批量更新分类失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.0: 删除记忆
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (!id || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  try {
    const success = deleteMemory(id);
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'memory not found' });
    }
  } catch (e) {
    logger.error('[Memory API] 删除记忆失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.0: 获取单个记忆详情
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (!id || id <= 0) {
    res.status(400).json({ error: 'invalid id' });
    return;
  }

  try {
    const memory = getMemory(id);
    if (memory) {
      res.json(memory);
    } else {
      res.status(404).json({ error: 'memory not found' });
    }
  } catch (e) {
    logger.error('[Memory API] 获取记忆详情失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

// v9.0: 混合搜索（向量 + FTS）
router.post('/search', async (req, res) => {
  const { query, topK, useHybrid } = req.body;

  if (!query || typeof query !== 'string') {
    res.status(400).json({ error: 'query is required and must be a string' });
    return;
  }

  try {
    const results = useHybrid
      ? await hybridSearchMemory(query, { topK: topK || 5 })
      : await searchMemory(query, topK || 5);
    res.json({ results });
  } catch (e) {
    logger.error('[Memory API] 搜索记忆失败:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
