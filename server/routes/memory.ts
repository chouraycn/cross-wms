import { Router } from 'express';
import { readMemoryMd, writeMemoryMd } from './chat.js';

const router = Router();

// 读取 MEMORY.md
router.get('/', (_req, res) => {
  const content = readMemoryMd();
  res.json({ content });
});

// 更新 MEMORY.md
router.post('/', (req, res) => {
  const { content } = req.body;
  if (typeof content !== 'string') {
    res.status(400).json({ error: 'content must be a string' });
    return;
  }
  try {
    writeMemoryMd(content);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: '写入失败' });
  }
});

export default router;
