import { Router } from 'express';
import { readMemoryMd, writeMemoryMd } from './memoryExtractor.js';
import { searchMemory, getMemoryStats, backfillEmbeddings } from '../engine/vecMemoryStore.js';
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
    const results = await searchMemory(query, 'default', topK, threshold);
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

export default router;
