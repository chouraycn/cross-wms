/**
 * Browser Profiles REST API — 浏览器配置文件管理端点
 *
 * v3.0: CRUD + 设置默认配置文件
 * - GET    /api/browser/profiles           — 列出所有配置文件
 * - POST   /api/browser/profiles           — 创建新配置文件
 * - DELETE /api/browser/profiles/:id       — 删除配置文件（不能删默认）
 * - PUT    /api/browser/profiles/:id/default — 设为默认配置文件
 */

import { Router } from 'express';
import {
  listProfiles,
  getProfile,
  createProfile,
  deleteProfile,
  setDefaultProfile,
} from '../dao/browserProfiles.js';

const router = Router();

/**
 * GET /api/browser/profiles
 * 列出所有浏览器配置文件
 */
router.get('/', (_req, res) => {
  try {
    const profiles = listProfiles();
    res.json({ ok: true, data: profiles });
  } catch (e) {
    res.status(500).json({ ok: false, error: `获取配置文件列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * POST /api/browser/profiles
 * 创建新的浏览器配置文件
 */
router.post('/', (req, res) => {
  try {
    const { name, userDataDir } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({ ok: false, error: 'name 参数不能为空' });
    }

    const profile = createProfile(name, userDataDir);
    res.status(201).json({ ok: true, data: profile });
  } catch (e) {
    res.status(500).json({ ok: false, error: `创建配置文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * DELETE /api/browser/profiles/:id
 * 删除浏览器配置文件（不能删除默认配置文件）
 */
router.delete('/:id', (req, res) => {
  try {
    const result = deleteProfile(req.params.id);
    if (!result.success) {
      if (result.error?.includes('不能删除默认')) {
        return res.status(403).json({ ok: false, error: result.error });
      }
      return res.status(404).json({ ok: false, error: result.error });
    }
    res.json({ ok: true, data: { success: true } });
  } catch (e) {
    res.status(500).json({ ok: false, error: `删除配置文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

/**
 * PUT /api/browser/profiles/:id/default
 * 设置指定配置文件为默认
 */
router.put('/:id/default', (req, res) => {
  try {
    const success = setDefaultProfile(req.params.id);
    if (!success) {
      return res.status(404).json({ ok: false, error: '配置文件不存在' });
    }
    res.json({ ok: true, data: { success: true } });
  } catch (e) {
    res.status(500).json({ ok: false, error: `设置默认配置文件失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
