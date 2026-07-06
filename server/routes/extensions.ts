/**
 * Extension REST API — 扩展管理端点
 *
 * CRUD + 加载 / 启用 / 禁用 / 发现 / 统计
 */

import { Router } from 'express';
import { extensionLoader } from '../../extensions/index.js';

const router = Router();

// GET /api/extensions — 列表
router.get('/', (req, res) => {
  try {
    const kind = req.query.kind as string | undefined;
    const enabled = req.query.enabled as string | undefined;

    let extensions = extensionLoader.list();

    if (kind) {
      extensions = extensions.filter((e) => e.manifest.kind === kind);
    }

    if (enabled !== undefined) {
      extensions = extensions.filter((e) => (enabled === 'true' ? e.enabled : !e.enabled));
    }

    res.json({
      data: extensions.map((e) => ({
        id: e.id,
        name: e.manifest.name,
        description: e.manifest.description,
        version: e.manifest.version,
        kind: e.manifest.kind,
        enabled: e.enabled,
        sdkVersion: e.manifest.sdkVersion,
        requiresAuth: e.manifest.requiresAuth,
        authType: e.manifest.authType,
        dependencies: e.manifest.dependencies,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: `获取扩展列表失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/discover — 发现可用扩展
router.get('/discover', async (req, res) => {
  try {
    const dir = req.query.dir as string | undefined;
    const manifests = await extensionLoader.discover(dir);
    res.json({
      data: manifests,
      count: manifests.length,
    });
  } catch (e) {
    res.status(500).json({ error: `发现扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/:id — 详情
router.get('/:id', (req, res) => {
  try {
    const ext = extensionLoader.get(req.params.id);
    if (!ext) {
      return res.status(404).json({ error: '扩展不存在' });
    }
    res.json({
      data: {
        id: ext.id,
        name: ext.manifest.name,
        description: ext.manifest.description,
        version: ext.manifest.version,
        kind: ext.manifest.kind,
        enabled: ext.enabled,
        manifest: ext.manifest,
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取扩展详情失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/:id/load — 加载扩展
router.post('/:id/load', async (req, res) => {
  try {
    const manifests = await extensionLoader.discover();
    const manifest = manifests.find((m) => m.id === req.params.id);

    if (!manifest) {
      return res.status(404).json({ error: '扩展清单未找到' });
    }

    const loaded = await extensionLoader.load(manifest);
    if (!loaded) {
      return res.status(400).json({ error: '扩展加载失败' });
    }

    res.json({ data: { success: true, message: '扩展已加载' } });
  } catch (e) {
    res.status(500).json({ error: `加载扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/:id/enable — 启用扩展
router.post('/:id/enable', async (req, res) => {
  try {
    const config = req.body?.config || {};
    const result = await extensionLoader.enable(req.params.id, config);

    if (!result) {
      return res.status(404).json({ error: '扩展启用失败' });
    }

    res.json({ data: { success: true, message: '扩展已启用' } });
  } catch (e) {
    res.status(500).json({ error: `启用扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/:id/disable — 禁用扩展
router.post('/:id/disable', async (req, res) => {
  try {
    const result = await extensionLoader.disable(req.params.id);

    if (!result) {
      return res.status(404).json({ error: '扩展禁用失败' });
    }

    res.json({ data: { success: true, message: '扩展已禁用' } });
  } catch (e) {
    res.status(500).json({ error: `禁用扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/load-all — 加载所有扩展
router.post('/load-all', async (req, res) => {
  try {
    const count = await extensionLoader.loadAll();
    res.json({ data: { success: true, loadedCount: count } });
  } catch (e) {
    res.status(500).json({ error: `加载扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/stats/summary — 统计信息
router.get('/stats/summary', (req, res) => {
  try {
    const extensions = extensionLoader.list();
    const enabled = extensions.filter((e) => e.enabled).length;

    const byKind: Record<string, number> = {};
    for (const ext of extensions) {
      byKind[ext.manifest.kind] = (byKind[ext.manifest.kind] || 0) + 1;
    }

    res.json({
      data: {
        total: extensions.length,
        enabled,
        disabled: extensions.length - enabled,
        byKind,
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取统计信息失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/kinds — 支持的扩展类型
router.get('/kinds', (_req, res) => {
  res.json({
    data: [
      { kind: 'provider', label: '模型提供商', description: 'LLM 模型提供扩展' },
      { kind: 'embedding-provider', label: '嵌入提供商', description: '文本嵌入提供扩展' },
      { kind: 'memory-host', label: '记忆后端', description: '记忆存储扩展' },
      { kind: 'channel', label: '消息通道', description: '消息通道扩展' },
      { kind: 'tool', label: '工具扩展', description: '自定义工具扩展' },
      { kind: 'service', label: '服务扩展', description: '后台服务扩展' },
      { kind: 'audio-provider', label: '音频提供', description: '语音合成/识别扩展' },
      { kind: 'image-generation', label: '图像生成', description: 'AI 图像生成扩展' },
      { kind: 'video-generation', label: '视频生成', description: 'AI 视频生成扩展' },
      { kind: 'web-search', label: '网页搜索', description: '网络搜索扩展' },
      { kind: 'security-provider', label: '安全提供', description: '安全扫描扩展' },
      { kind: 'api-integration', label: 'API 集成', description: '第三方 API 集成扩展' },
    ],
  });
});

export default router;