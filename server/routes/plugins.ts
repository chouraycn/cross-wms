/**
 * Plugin REST API — 插件管理端点
 *
 * v3.0: CRUD + install / enable / disable / health / reload
 * POST /api/plugins/install 使用自定义 multipart 解析器（与 upload.ts 一致）
 */

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { pluginRegistry } from '../engine/pluginRegistry.js';
import { listPlugins, getPlugin, getPluginConfig, setPluginConfig } from '../dao/plugins.js';
import { parseMultipartFormData, MAX_UPLOAD_SIZE } from './upload.js';
import { AppPaths } from '../config/appPaths.js';

const router = Router();

/** 插件临时上传目录 */
const PLUGIN_UPLOADS_DIR = path.join(AppPaths.pluginsDir, '.uploads');

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

// POST /api/plugins/install/git — 从 Git 仓库安装
router.post('/install/git', async (req, res) => {
  try {
    const { gitUrl, branch, subdir } = req.body || {};
    if (!gitUrl || typeof gitUrl !== 'string') {
      return res.status(400).json({ error: '缺少 gitUrl 参数' });
    }

    const pluginRow = await pluginRegistry.installFromGit(gitUrl, {
      branch: typeof branch === 'string' ? branch : undefined,
      subdir: typeof subdir === 'string' ? subdir : undefined,
    });
    res.json({ data: pluginRow });
  } catch (e) {
    res.status(500).json({ error: `Git 插件安装失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/install/npm — 从 npm 安装
router.post('/install/npm', async (req, res) => {
  try {
    const { packageName, version } = req.body || {};
    if (!packageName || typeof packageName !== 'string') {
      return res.status(400).json({ error: '缺少 packageName 参数' });
    }

    const pluginRow = await pluginRegistry.installFromNpm(packageName, {
      version: typeof version === 'string' ? version : undefined,
    });
    res.json({ data: pluginRow });
  } catch (e) {
    res.status(500).json({ error: `npm 插件安装失败: ${e instanceof Error ? e.message : String(e)}` });
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

// GET /api/plugins/:id/config — 获取插件配置
router.get('/:id/config', (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }

    let configSchema = null;
    try {
      const manifest = JSON.parse(plugin.manifest_json || '{}');
      configSchema = manifest.configSchema || null;
    } catch {
      // manifest 解析失败时忽略
    }

    const config = getPluginConfig(req.params.id);
    res.json({
      data: {
        config,
        configSchema,
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取插件配置失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// PUT /api/plugins/:id/config — 更新插件配置
router.put('/:id/config', (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }

    const config = req.body?.config;
    if (typeof config !== 'object' || config === null) {
      return res.status(400).json({ error: 'config 参数必须是对象' });
    }

    const updated = setPluginConfig(req.params.id, config as Record<string, unknown>);
    if (!updated) {
      return res.status(500).json({ error: '更新插件配置失败' });
    }

    res.json({ data: { config: getPluginConfig(req.params.id) } });
  } catch (e) {
    res.status(500).json({ error: `更新插件配置失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/plugins/:id/config/reset — 重置插件配置为默认值
router.post('/:id/config/reset', (req, res) => {
  try {
    const plugin = getPlugin(req.params.id);
    if (!plugin) {
      return res.status(404).json({ error: '插件不存在' });
    }

    // 从 configSchema 中提取默认值
    const defaultConfig: Record<string, unknown> = {};
    try {
      const manifest = JSON.parse(plugin.manifest_json || '{}');
      const schema = manifest.configSchema;
      if (schema?.fields && Array.isArray(schema.fields)) {
        for (const field of schema.fields) {
          if (field.default !== undefined) {
            defaultConfig[field.key] = field.default;
          }
        }
      }
    } catch {
      // 解析失败时使用空配置
    }

    const updated = setPluginConfig(req.params.id, defaultConfig);
    if (!updated) {
      return res.status(500).json({ error: '重置插件配置失败' });
    }

    res.json({ data: { config: defaultConfig } });
  } catch (e) {
    res.status(500).json({ error: `重置插件配置失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;
