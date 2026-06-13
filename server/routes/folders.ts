import { Router } from 'express';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../dao/chat.js';

const router = Router();

// 获取文件夹列表
router.get('/', (_req, res) => {
  const folders = getFolders();
  res.json({ folders });
});

// 创建文件夹
router.post('/', (req, res) => {
  const { name, parentId } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const folder = createFolder(name.trim(), parentId || null);
  res.json({ folder });
});

// 更新文件夹
router.patch('/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const folder = updateFolder(req.params.id, name.trim());
  if (!folder) {
    return res.status(404).json({ error: 'folder not found' });
  }
  res.json({ folder });
});

// 删除文件夹
router.delete('/:id', (req, res) => {
  deleteFolder(req.params.id);
  res.json({ ok: true });
});

export default router;
