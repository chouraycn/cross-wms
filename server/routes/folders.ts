import { Router } from 'express';
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../dao/chat.js';
import { ok, fail, notFound, BizCode } from './_shared/respond.js';

const router = Router();

// 获取文件夹列表
router.get('/', (_req, res) => {
  const folders = getFolders();
  return ok(res, { folders });
});

// 创建文件夹
router.post('/', (req, res) => {
  const { name, parentId } = req.body;
  if (!name || !name.trim()) {
    return fail(res, BizCode.BAD_REQUEST, 'name is required', 400);
  }
  const folder = createFolder(name.trim(), parentId || null);
  return ok(res, { folder });
});

// 更新文件夹
router.patch('/:id', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return fail(res, BizCode.BAD_REQUEST, 'name is required', 400);
  }
  const folder = updateFolder(req.params.id, name.trim());
  if (!folder) {
    return notFound(res, 'folder not found');
  }
  return ok(res, { folder });
});

// 删除文件夹
router.delete('/:id', (req, res) => {
  deleteFolder(req.params.id);
  return ok(res, { ok: true });
});

export default router;
