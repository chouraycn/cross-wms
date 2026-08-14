/**
 * Extension REST API — 扩展管理端点
 *
 * CRUD + 加载 / 启用 / 禁用 / 发现 / 统计
 */

import { Router } from 'express';
import { ok } from './_shared/respond.js';
import { extensionLoader } from '../../extensions/index.js';

const router = Router();

// POST /api/extensions — 创建扩展（写入 manifest + index.ts 模板并注册）
router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id || !String(body.id).trim()) {
      return res.status(400).json({ error: 'id 必填' });
    }
    const manifest = await extensionLoader.create({
      id: String(body.id),
      name: String(body.name ?? body.id),
      description: body.description ? String(body.description) : '',
      kind: body.kind,
      version: body.version,
    });
    if (!manifest) {
      return res.status(400).json({ error: '创建失败（id 可能重复）' });
    }
    res.status(201).json({ data: manifest, message: '扩展已创建' });
  } catch (e) {
    res.status(500).json({ error: `创建扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/import-discovered/:id — 将 discover 结果加载到运行时
router.post('/import-discovered/:id', async (req, res) => {
  try {
    const manifests = await extensionLoader.discover();
    const manifest = manifests.find((m) => m.id === req.params.id);
    if (!manifest) return res.status(404).json({ error: '未发现该扩展 manifest' });
    const loaded = await extensionLoader.load(manifest);
    res.json({
      success: loaded,
      message: loaded ? '扩展已加载' : '扩展加载失败或已存在',
    });
  } catch (e) {
    res.status(500).json({ error: `加载发现扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// DELETE /api/extensions/:id — 删除扩展
router.delete('/:id', async (req, res) => {
  try {
    const result = await extensionLoader.remove(req.params.id);
    if (!result.success) {
      return res.status(404).json({ error: result.message || '删除失败' });
    }
    ok(res, { success: true, message: result.message });
  } catch (e) {
    res.status(500).json({ error: `删除扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// PUT /api/extensions/:id — 更新扩展元数据（名称 / 描述 / 类型 / 版本）
router.put('/:id', async (req, res) => {
  try {
    const body = req.body || {};
    const manifest = await extensionLoader.update(req.params.id, {
      name: typeof body.name === 'string' ? body.name : undefined,
      description: typeof body.description === 'string' ? body.description : undefined,
      kind: typeof body.kind === 'string' ? body.kind : undefined,
      version: typeof body.version === 'string' ? body.version : undefined,
    });
    if (!manifest) {
      return res.status(404).json({ error: '扩展不存在或更新失败' });
    }
    res.json({ data: manifest, message: '扩展已更新' });
  } catch (e) {
    res.status(500).json({ error: `更新扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

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

    ok(res, { success: true, message: '扩展已加载' });
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

    ok(res, { success: true, message: '扩展已启用' });
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

    ok(res, { success: true, message: '扩展已禁用' });
  } catch (e) {
    res.status(500).json({ error: `禁用扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/load-all — 加载所有扩展
router.post('/load-all', async (req, res) => {
  try {
    const count = await extensionLoader.loadAll();
    ok(res, { success: true, loadedCount: count });
  } catch (e) {
    res.status(500).json({ error: `加载扩展失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/stats/summary — 统计信息
router.get('/stats/summary', async (req, res) => {
  try {
    const extensions = extensionLoader.list();
    const enabled = extensions.filter((e) => e.enabled).length;

    // 草稿 = 已发现但未加载的扩展（磁盘上有 manifest 但未注册到运行时）
    const discovered = await extensionLoader.discover();
    const loadedIds = new Set(extensions.map((e) => e.id));
    const draft = discovered.filter((m) => !loadedIds.has(m.id)).length;

    const byKind: Record<string, number> = {};
    for (const ext of extensions) {
      byKind[ext.manifest.kind] = (byKind[ext.manifest.kind] || 0) + 1;
    }

    res.json({
      data: {
        total: extensions.length,
        enabled,
        disabled: extensions.length - enabled,
        draft,
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

// GET /api/extensions/:id — 详情（必须放在所有固定路径路由之后）
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
        config: extensionLoader.getConfig(ext.id),
        registeredTools: extensionLoader.getRegisteredToolNames(ext.id),
      },
    });
  } catch (e) {
    res.status(500).json({ error: `获取扩展详情失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// GET /api/extensions/:id/tools — 扩展注册的工具名列表
router.get('/:id/tools', (req, res) => {
  try {
    const ext = extensionLoader.get(req.params.id);
    if (!ext) {
      return res.status(404).json({ error: '扩展不存在' });
    }
    ok(res, { tools: extensionLoader.getRegisteredToolNames(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: `获取扩展工具失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

// POST /api/extensions/:id/tools/:name/invoke — 冒烟测试：调用扩展注册的工具
router.post('/:id/tools/:name/invoke', async (req, res) => {
  try {
    const ext = extensionLoader.get(req.params.id);
    if (!ext) {
      return res.status(404).json({ error: '扩展不存在' });
    }
    if (!ext.enabled) {
      return res.status(400).json({ error: '扩展未启用' });
    }
    const toolName = req.params.name;
    const registered = extensionLoader.getRegisteredToolNames(req.params.id);
    if (!registered.includes(toolName)) {
      return res.status(404).json({ error: `工具 ${toolName} 不属于扩展 ${req.params.id}` });
    }
    const { executeToolCall } = await import('../engine/toolRegistry.js');
    const args = (req.body?.args ?? req.body?.input ?? {}) as Record<string, unknown>;
    const result = await executeToolCall({
      id: `smoke-${Date.now()}`,
      type: 'function',
      function: { name: toolName, arguments: JSON.stringify(args) },
    } as never);
    ok(res, { result });
  } catch (e) {
    res.status(500).json({ error: `调用工具失败: ${e instanceof Error ? e.message : String(e)}` });
  }
});

export default router;