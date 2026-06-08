/**
 * Models Routes — 模型管理 API
 *
 * Mounted at /api/models
 * - GET  /api/models              → 返回 ModelsFile（含内置兜底）
 * - PUT  /api/models              → 全量保存 models + defaultModelId
 * - POST /api/models/reset        → 重置为内置默认
 * - POST /api/models/test-connection → 测试 API 连接
 */

import { Router, type Request, type Response } from 'express';
import {
  loadModelsConfig,
  saveModelsConfig,
  getBuiltinModels,
} from '../modelsStore.js';

const router = Router();

// GET /api/models — 读取当前模型配置
router.get('/', (_req: Request, res: Response) => {
  try {
    const config = loadModelsConfig();
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PUT /api/models — 全量保存模型配置
router.put('/', (req: Request, res: Response) => {
  try {
    const { models, defaultModelId } = req.body;
    if (!Array.isArray(models)) {
      res.status(400).json({ error: 'models 必须是数组' });
      return;
    }
    const config = saveModelsConfig(models, defaultModelId || models[0]?.id || '');
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/reset — 重置为内置默认
router.post('/reset', (_req: Request, res: Response) => {
  try {
    const builtin = getBuiltinModels();
    const config = saveModelsConfig(builtin, 'gpt-4o');
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/test-connection — 测试 API 连接（真实请求 + 返回模型列表）
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const { apiEndpoint, apiKey, modelId } = req.body as {
      apiEndpoint?: string;
      apiKey?: string;
      modelId?: string;
    };

    if (!apiEndpoint) {
      res.status(400).json({ success: false, message: 'API 端点不能为空' });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

    try {
      let models: string[] = [];
      let message = '';

      // --- Anthropic：真实调用 ---
      if (apiEndpoint.includes('anthropic.com')) {
        const testBody = JSON.stringify({
          model: modelId || 'claude-3-5-sonnet-latest',
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }],
        });
        const resp = await fetch(`${apiEndpoint}/v1/messages`, {
          method: 'POST',
          headers: { ...headers, 'anthropic-version': '2023-06-01' },
          body: testBody,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        if (resp.ok) {
          message = 'Anthropic API 连接成功';
          // 尝试解析响应中的模型信息
          try { const j = await resp.json(); if (j.model) models = [j.model]; } catch {}
        } else {
          const txt = await resp.text().catch(() => '');
          clearTimeout(timeout);
          res.json({ success: false, message: `Anthropic API 错误 ${resp.status}: ${txt.slice(0, 200)}` });
          return;
        }
      }
      // --- OpenAI 兼容（含腾讯云等）---
      else {
        // 先尝试 GET /models
        const modelsUrl = apiEndpoint.endsWith('/') ? `${apiEndpoint}models` : `${apiEndpoint}/models`;
        const resp = await fetch(modelsUrl, {
          method: 'GET',
          headers,
          signal: controller.signal,
        });

        if (resp.ok) {
          const j = await resp.json();
          // OpenAI 格式: { data: [{ id: '...' }] }
          if (Array.isArray(j.data)) {
            models = j.data.map((m: { id?: string }) => m.id).filter(Boolean).slice(0, 50);
          } else if (Array.isArray(j.models)) {
            models = j.models.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean).slice(0, 50);
          }
          message = models.length > 0
            ? `连接成功，发现 ${models.length} 个可用模型`
            : '连接成功，但未返回模型列表';
        } else if (resp.status === 404) {
          // 不支持 /models 端点，尝试一次最小补全调用
          const chatUrl = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;
          const testResp = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: modelId || '', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
            signal: controller.signal,
          });
          clearTimeout(timeout);
          if (testResp.ok || testResp.status === 400) {
            // 400 也可能是缺 model 参数，但端点本身可达
            message = '连接成功（端点可达，但未返回模型列表）';
          } else {
            const txt = await testResp.text().catch(() => '');
            clearTimeout(timeout);
            res.json({ success: false, message: `API 错误 ${testResp.status}: ${txt.slice(0, 200)}` });
            return;
          }
        } else {
          const txt = await resp.text().catch(() => '');
          clearTimeout(timeout);
          res.json({ success: false, message: `API 错误 ${resp.status}: ${txt.slice(0, 200)}` });
          return;
        }
      }

      clearTimeout(timeout);
      res.json({ success: true, message, models });
    } catch (fetchError: unknown) {
      clearTimeout(timeout);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        res.json({ success: false, message: '连接超时（8秒）' });
      } else {
        const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        res.json({ success: false, message: `连接失败: ${msg}` });
      }
    }
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
});

export default router;
