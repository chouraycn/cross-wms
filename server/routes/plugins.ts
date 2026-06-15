/**
 * Plugin REST API — 插件管理端点
 *
 * v3.0: CRUD + install / enable / disable / health / reload
 * POST /api/plugins/install 使用自定义 multipart 解析器（与 upload.ts 一致）
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { pluginRegistry } from '../engine/pluginRegistry.js';
import { listPlugins, getPlugin } from '../dao/plugins.js';
import { parseMultipartFormData, MAX_UPLOAD_SIZE } from './upload.js';

const router = Router();

/** 插件临时上传目录 */
const PLUGIN_UPLOADS_DIR = path.join(os.homedir(), '.cdf-know-claw', 'plugins', '.uploads');

function ensurePluginUploadsDir(): void {
  if (!fs.existsSync(PLUGIN_UPLOADS_DIR)) {
    fs.mkdirSync(PLUGIN_UPLOADS_DIR, { recursive: true });
  }
}

// GET /api/plugins — 列表
router.get('/', (req, res) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const page = Number(req.query.page) || 1;
    const pageSize = Number(req.query.pageSize) || 20;

    const result = listPlugins(status, search, page, pageSize);
    res.json({ data: result });
  } catch (e) {
    res.status(500).json({ error: `获取插件列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/plugins/health — 健康状态
router.get('/health', (req, res) => {
  try {
    const health = pluginRegistry.getHealth();
    res.json({ data: health });
  } catch (e) {
    res.status(500).json({ error: `获取插件健康状态失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/plugins/:id — 详情
router.get('/:id', (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }
    res.json({ data: plugin });
  } catch (e) {
    res.status(500).json({ error: `获取插件详情失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/install — 安装（multipart file upload）
router.post('/install', async (req, res) => {
  try {
    ensurePluginUploadsDir();

    // 使用自定义 multipart 解析器
    const parsed = await parseMultipartFormData(req as any);
    if (!parsed) {
      return res.status(400).json({ error: '未找到插件包文件或请求格式错误' });
    }

    const { fileName, data } = parsed;

    // 验证文件扩展名
    const ext = path.extname(fileName).toLowerCase();
    if (ext !== '.zip') {
      return res.status(400).json({ error: '仅支持 .zip 格式的插件包' });
    }

    // 验证文件大小（最大 50MB）
    const MAX_PLUGIN_SIZE = 50 * 1024 * 1024;
    if (data.length > MAX_PLUGIN_SIZE) {
      return res.status(400).json({ error: `插件包大小超过 50MB 限制（当前 ${(data.length / 1024 / 1024).toFixed(1)}MB）` });
    }

    // 保存到临时目录
    const tmpFileName = `plugin-upload-${Date.now()}.zip`;
    const tmpFilePath = path.join(PLUGIN_UPLOADS_DIR, tmpFileName);
    fs.writeFileSync(tmpFilePath, data);

    try {
      // 执行安装
      const pluginRow = await pluginRegistry.install(tmpFilePath);
      res.json({ data: pluginRow });
    } finally {
      // 清理临时文件
      try {
        if (fs.existsSync(tmpFilePath)) {
          fs.unlinkSync(tmpFilePath);
        }
      } catch {
        // 忽略清理失败
      }
    }
  } catch (e) {
    res.status(500).json({ error: `插件安装失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/:id/enable — 启用
router.post('/:id/enable', async (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }
    const updated = await pluginRegistry.enable(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: '插件启用失败' });
    }
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: `插件启用失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/:id/disable — 禁用
router.post('/:id/disable', async (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }
    const updated = await pluginRegistry.disable(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: '插件禁用失败' });
    }
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: `插件禁用失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/plugins/:id — 卸载
router.delete('/:id', async (req, res) => {
  try {
    const success = await pluginRegistry.uninstall(req.params.id);
    if (!success) {
      return res.status(404).json({ error: '插件不存在或卸载失败' });
    }
    res.json({ data: { success: true } });
  } catch (e) {
    res.status(500).json({ error: `插件卸载失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/:id/reload — 重新加载
router.post('/:id/reload', async (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }
    const updated = await pluginRegistry.reload(req.params.id);
    if (!updated) {
      return res.status(404).json({ error: '插件重新加载失败' });
    }
    res.json({ data: updated });
  } catch (e) {
    res.status(500).json({ error: `插件重新加载失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
