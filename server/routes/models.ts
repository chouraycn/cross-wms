/**
 * Models Routes — 模型管理 API
 *
 * Mounted at /api/models
 * - GET  /api/models              → 返回 ModelsFile（含内置兜底）
 * - PUT  /api/models              → 全量保存 models + defaultModelId
 * - POST /api/models/reset        → 重置为内置默认
 * - POST /api/models/test-connection → 测试 API 连接
 * - POST /api/models/health-check  → 批量健康检查（所有已启用模型）
 */

import { Router, type Request, type Response } from 'express';
import {
  loadModelsConfig,
  saveModelsConfig,
  getBuiltinModels,
  isLocalModel,
  deleteModelConfig,
  getRecommendedModels,
  getRecommendedModelById,
  isFirstLaunch,
} from '../modelsStore.js';

const router = Router();

// GET /api/models — 读取当前模型配置（返回时脱敏 API Key）
router.get('/', async (_req: Request, res: Response) => {
  try {
    // v1.5.203: skipKeyInjection 跳过 Keychain execSync 调用，避免阻塞事件循环
    // 此端点返回时本就脱敏移除 apiKey/apiKeys，不需要注入
    const config = await loadModelsConfig({ skipKeyInjection: true });
    // 脱敏：移除明文 apiKey 和 apiKeys，只保留引用信息
    // （skipKeyInjection 路径已不含 key，但保留此脱敏作为安全兜底）
    const sanitized = {
      ...config,
      models: config.models.map((m) => {
        const { apiKey, apiKeys, ...rest } = m as any;
        return rest;
      }),
    };
    res.json({ data: sanitized });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// PUT /api/models — 全量保存模型配置
// v1.9.3-fix: 合并前端传来的数据与已有配置，保留 API Key 引用（apiKeyRef/apiKeyRefs）
// 前端 GET 时拿到的数据不含明文 apiKey（已脱敏），直接覆盖会导致 Key 引用丢失
router.put('/', async (req: Request, res: Response) => {
  try {
    const { models, defaultModelId } = req.body;
    if (!Array.isArray(models)) {
      res.status(400).json({ error: 'models 必须是数组' });
      return;
    }

    // 读取当前已有配置（含 apiKeyRef/apiKeyRefs）
    const currentConfig = await loadModelsConfig();
    const currentMap = new Map(currentConfig.models.map(m => [m.id, m]));

    // 合并：前端传来的字段覆盖，但保留已有的 apiKeyRef/apiKeyRefs/keyStrategy
    const mergedModels = models.map((m: any) => {
      const existing = currentMap.get(m.id);
      if (!existing) return m; // 新模型，直接使用
      return {
        ...existing,              // 保留已有字段（含 apiKeyRef/apiKeyRefs）
        ...m,                     // 前端传来的字段覆盖
        // 确保 Key 引用不被覆盖为 undefined
        apiKeyRef: m.apiKeyRef ?? (existing as any).apiKeyRef,
        apiKeyRefs: m.apiKeyRefs ?? (existing as any).apiKeyRefs,
        keyStrategy: m.keyStrategy ?? (existing as any).keyStrategy,
      };
    });

    // 检测被删除的模型（物理删除或 hidden），清理 Keychain 中的 API Key
    const newIds = new Set(mergedModels.map((m: any) => m.id));
    for (const oldModel of currentConfig.models) {
      if (!newIds.has(oldModel.id)) {
        // 模型被物理删除，清理 Keychain
        deleteModelConfig(oldModel.id);
      }
    }

    const config = await saveModelsConfig(mergedModels, defaultModelId || mergedModels[0]?.id || '');
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/reset — 重置为内置默认
router.post('/reset', async (_req: Request, res: Response) => {
  try {
    const builtin = getBuiltinModels();
    const config = await saveModelsConfig(builtin, 'gpt-4o');
    res.json({ data: config });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/health-check — 批量健康检查（所有已启用模型）
// 请求体可选 { models: ModelConfig[] }，不传则自动读取当前配置中的已启用模型
// 返回 { data: HealthCheckResult[] }
interface HealthCheckItem {
  modelId: string;
  status: 'healthy' | 'unhealthy' | 'timeout' | 'skipped';
  message: string;
  latency?: number;
  checkedAt: string;
}

router.post('/health-check', async (req: Request, res: Response) => {
  try {
    // 获取待检查的模型列表
    let modelsToCheck: Array<{
      id: string;
      provider: string;
      apiEndpoint?: string;
      apiKey?: string;
      enabled?: boolean;
    }>;

    if (Array.isArray(req.body?.models) && req.body.models.length > 0) {
      modelsToCheck = req.body.models;
    } else {
      const config = await loadModelsConfig();
      modelsToCheck = config.models.filter(m => m.enabled);
    }

    if (modelsToCheck.length === 0) {
      res.json({ data: [] });
      return;
    }

    // 按端点分组（不再按 Key 分组，每个模型独立检测以支持多 Key 场景）
    const endpointModels = new Map<string, string[]>(); // endpoint -> modelIds

    for (const model of modelsToCheck) {
      const endpoint = model.apiEndpoint || '';
      if (!endpoint) continue;
      if (!endpointModels.has(endpoint)) {
        endpointModels.set(endpoint, []);
      }
      endpointModels.get(endpoint)!.push(model.id);
    }

    // 并行检测每个模型（独立 Key）
    const results: HealthCheckItem[] = [];
    const checkPromises: Promise<void>[] = [];

    for (const model of modelsToCheck) {
      const endpoint = model.apiEndpoint || '';
      const apiKey = model.apiKey || '';
      if (!endpoint) continue;

      checkPromises.push((async () => {
        const controller = new AbortController();
        // 本地模型给更长的超时（首次推理可能较慢）
        const timeoutMs = isLocalModel(model) ? 20000 : 6000;
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        const startTime = Date.now();

        try {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          let success = false;
          let message = '';

          // Anthropic 特殊处理
          if (endpoint.includes('anthropic.com')) {
            const resp = await fetch(`${endpoint}/v1/messages`, {
              method: 'POST',
              headers: { ...headers, 'anthropic-version': '2023-06-01' },
              body: JSON.stringify({
                model: model.id || 'claude-3-5-sonnet-latest',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'Hi' }],
              }),
              signal: controller.signal,
            });
            success = resp.ok;
            message = success ? '连接正常' : `API 错误 ${resp.status}`;
          } else {
            // OpenAI 兼容：GET /models
            const modelsUrl = endpoint.endsWith('/') ? `${endpoint}models` : `${endpoint}/models`;
            const resp = await fetch(modelsUrl, {
              method: 'GET',
              headers,
              signal: controller.signal,
            });
            success = resp.ok;
            message = success ? '连接正常' : `API 错误 ${resp.status}`;
          }

          const latency = Date.now() - startTime;
          const status: HealthCheckItem['status'] = success ? 'healthy' : 'unhealthy';

          results.push({
            modelId: model.id,
            status,
            message,
            latency,
            checkedAt: new Date().toISOString(),
          });
        } catch (fetchError: unknown) {
          const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError';
          const status: HealthCheckItem['status'] = isTimeout ? 'timeout' : 'unhealthy';
          const message = isTimeout ? '连接超时（6秒）' : `连接失败`;
          const latency = Date.now() - startTime;

          results.push({
            modelId: model.id,
            status,
            message,
            latency,
            checkedAt: new Date().toISOString(),
          });
        } finally {
          clearTimeout(timeout);
        }
      })());
    }

    // 为跳过的模型（无端点）添加 skipped 状态
    for (const model of modelsToCheck) {
      if (!model.apiEndpoint) {
        results.push({
          modelId: model.id,
          status: 'skipped',
          message: '未配置 API 端点',
          checkedAt: new Date().toISOString(),
        });
      }
    }

    await Promise.all(checkPromises);

    // 按 modelId 排序
    results.sort((a, b) => a.modelId.localeCompare(b.modelId));

    res.json({ data: results });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/discover-local — 自动发现本地模型（Ollama / vLLM）
// 扫描常见本地端点，返回可用的模型列表
interface DiscoveredModel {
  id: string;
  name: string;
  provider: string;
  apiEndpoint: string;
  size?: string;
  family?: string;
  parameterSize?: string;
  contextWindow?: number;
}

/** v1.9.3: 动态检测宿主机 IP（VM 网关地址） */
function getHostIp(): string {
  try {
    const os = require('os');
    const interfaces = os.networkInterfaces();

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name] || []) {
        if (!iface.internal && iface.family === 'IPv4') {
          if (iface.address.startsWith('192.168.64.')) return '192.168.64.1';
          if (iface.address.startsWith('172.17.')) return '172.17.0.1';
        }
      }
    }

    // 回退：读取默认网关
    try {
      const { execSync } = require('child_process');
      const routeOutput = execSync('ip route | grep default', { encoding: 'utf8', timeout: 2000 });
      const match = routeOutput.match(/via\s+(\S+)/);
      if (match) return match[1];
    } catch {
      // ignore
    }
  } catch {
    // ignore
  }
  return '192.168.64.1';
}

// GET /api/models/host-ip — 动态检测宿主机 IP（VM 网关地址）
router.get('/host-ip', (_req: Request, res: Response) => {
  res.json({ hostIp: getHostIp() });
});

router.post('/discover-local', async (req: Request, res: Response) => {
  try {
    const results: DiscoveredModel[] = [];

    // v1.9.4: 优先使用 localhost，IP 地址作为备用（本地应用中 Ollama 直接运行在本机）
    const defaultHostIp = getHostIp();
    const customOllamaUrl = (req.body as any)?.ollamaUrl?.replace(/\/+$/, '') || 'http://localhost:11434';

    // 要扫描的本地端点列表 — localhost 优先，IP 地址作为备用
    const localEndpoints = [
      { name: 'Ollama (本地)', url: 'http://localhost:11434', provider: 'ollama' },
      { name: 'Ollama (自定义)', url: customOllamaUrl, provider: 'ollama' },
      { name: 'Ollama (宿主机)', url: `http://${defaultHostIp}:11434`, provider: 'ollama' },
      { name: 'Ollama (11435)', url: 'http://localhost:11435', provider: 'ollama' },
      { name: 'vLLM (8000)', url: 'http://localhost:8000', provider: 'custom' },
      { name: 'vLLM (8001)', url: 'http://localhost:8001', provider: 'custom' },
      { name: 'LM Studio', url: 'http://localhost:1234', provider: 'custom' },
    ];

    const discoverPromises = localEndpoints.map(async (ep) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000); // 3 秒超时

      try {
        // Ollama 使用专用 API
        if (ep.provider === 'ollama') {
          const resp = await fetch(`${ep.url}/api/tags`, {
            method: 'GET',
            signal: controller.signal,
          });
          clearTimeout(timeout);

          if (!resp.ok) return;

          const data = await resp.json();
          if (data.models && Array.isArray(data.models)) {
            for (const m of data.models) {
              results.push({
                id: m.name || m.model || '',
                name: (m.name || m.model || '').split(':')[0] || m.name || m.model,
                provider: 'ollama',
                apiEndpoint: `${ep.url}/v1`,
                size: m.size ? `${(m.size / 1e9).toFixed(1)}GB` : undefined,
                family: m.details?.family || undefined,
                parameterSize: m.details?.parameter_size || undefined,
                contextWindow: m.details?.context_length || undefined,
              });
            }
          }
        } else {
          // vLLM / LM Studio / 其他 — 使用 OpenAI 兼容 GET /v1/models
          const modelsUrl = ep.url.endsWith('/') ? `${ep.url}v1/models` : `${ep.url}/v1/models`;
          const resp = await fetch(modelsUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
          });
          clearTimeout(timeout);

          if (!resp.ok) return;

          const data = await resp.json();
          const modelList = data.data || data.models || [];
          for (const m of modelList) {
            const modelId = m.id || m.name || '';
            results.push({
              id: modelId,
              name: modelId.split('/').pop() || modelId,
              provider: 'custom',
              apiEndpoint: ep.url.endsWith('/') ? `${ep.url}v1` : `${ep.url}/v1`,
              contextWindow: m.context_length || undefined,
            });
          }
        }
      } catch {
        // 端点不可用，静默跳过
        clearTimeout(timeout);
      }
    });

    await Promise.all(discoverPromises);

    // 去重（按 id + apiEndpoint）
    const seen = new Set<string>();
    const unique: DiscoveredModel[] = [];
    for (const m of results) {
      const key = `${m.id}@${m.apiEndpoint}`;
      if (!seen.has(key) && m.id) {
        seen.add(key);
        unique.push(m);
      }
    }

    res.json({ data: unique });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/test-connection — 测试 API 连接（真实请求 + 返回模型列表 + 验证 modelId）
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
      let modelValid = false;

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
        if (resp.ok) {
          message = 'Anthropic API 连接成功';
          modelValid = true;
          // 尝试解析响应中的模型信息
          try { const j = await resp.json() as any; if (j.model) models = [j.model]; } catch {}
        } else {
          const txt = await resp.text().catch(() => '');
          // 检查是否是模型不存在错误
          if (resp.status === 404 || txt.toLowerCase().includes('model') || txt.toLowerCase().includes('not_found')) {
            res.json({ success: false, message: `模型 "${modelId}" 不存在或不可用`, modelValid: false, models: [] });
            return;
          }
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
          const j = await resp.json() as any;
          // OpenAI 格式: { data: [{ id: '...' }] }
          if (Array.isArray(j.data)) {
            models = j.data.map((m: { id?: string }) => m.id).filter(Boolean).slice(0, 50);
          } else if (Array.isArray(j.models)) {
            models = j.models.map((m: { id?: string; name?: string }) => m.id || m.name).filter(Boolean).slice(0, 50);
          }

          // 验证 modelId 是否在返回的模型列表中
          if (modelId && models.length > 0) {
            modelValid = models.some(m => m === modelId || m.includes(modelId));
          }

          message = models.length > 0
            ? `连接成功，发现 ${models.length} 个可用模型`
            : '连接成功，但未返回模型列表';
        } else if (resp.status === 404) {
          // 不支持 /models 端点，尝试一次最小补全调用验证 modelId
          const chatUrl = apiEndpoint.endsWith('/') ? `${apiEndpoint}chat/completions` : `${apiEndpoint}/chat/completions`;
          const testResp = await fetch(chatUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model: modelId || '', max_tokens: 1, messages: [{ role: 'user', content: 'Hi' }] }),
            signal: controller.signal,
          });
          if (testResp.ok) {
            modelValid = true;
            message = '连接成功，模型可用';
          } else if (testResp.status === 400) {
            const txt = await testResp.text().catch(() => '');
            // 400 可能是缺 model 参数，也可能是模型不存在
            if (txt.toLowerCase().includes('model') && (txt.toLowerCase().includes('not found') || txt.toLowerCase().includes('does not exist') || txt.toLowerCase().includes('invalid'))) {
              res.json({ success: false, message: `模型 "${modelId}" 不存在或不可用`, modelValid: false, models: [] });
              return;
            }
            message = '连接成功（端点可达，但未返回模型列表）';
          } else {
            const txt = await testResp.text().catch(() => '');
            res.json({ success: false, message: `API 错误 ${testResp.status}: ${txt.slice(0, 200)}` });
            return;
          }
        } else {
          const txt = await resp.text().catch(() => '');
          // v1.9.3: 改进 401 错误提示，区分 Key 无效和 Key 丢失
          if (resp.status === 401) {
            const isInvalidKey = txt.toLowerCase().includes('invalid') || txt.toLowerCase().includes('authentication');
            const msg = isInvalidKey
              ? `API Key 无效或已过期。请检查：\n1. Key 是否正确（从服务商控制台复制）\n2. Key 是否已过期或被撤销\n3. 是否使用了正确的服务商端点\n\n原始错误：${txt.slice(0, 200)}`
              : `认证失败（401）。请检查 API Key 是否正确配置。\n\n原始错误：${txt.slice(0, 200)}`;
            res.json({ success: false, message: msg });
            return;
          }
          res.json({ success: false, message: `API 错误 ${resp.status}: ${txt.slice(0, 200)}` });
          return;
        }
      }

      // 如果提供了 modelId 但验证失败，给出明确提示
      if (modelId && !modelValid && models.length > 0) {
        const similar = models.filter(m => m.toLowerCase().includes(modelId.toLowerCase().split('-')[0])).slice(0, 5);
        const hint = similar.length > 0 ? `。您是否想使用：${similar.join(', ')}` : '';
        res.json({
          success: true,
          message: `连接成功，但模型 "${modelId}" 不在该账户的可用列表中${hint}`,
          modelValid: false,
          models,
        });
        return;
      }

      res.json({ success: true, message, modelValid, models });
    } catch (fetchError: unknown) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        res.json({ success: false, message: '连接超时（8秒）' });
      } else {
        const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
        res.json({ success: false, message: `连接失败: ${msg}` });
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    res.status(500).json({ success: false, message: (e as Error).message });
  }
});

// GET /api/models/recommended — 获取推荐模型列表
router.get('/recommended', async (_req: Request, res: Response) => {
  try {
    const recommended = getRecommendedModels();
    const sanitized = recommended.map((m) => {
      const { apiKey, apiKeys, ...rest } = m as any;
      return rest;
    });
    res.json({ data: sanitized });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /api/models/is-first-launch — 检测是否为首次启动（模型列表为空）
router.get('/is-first-launch', async (_req: Request, res: Response) => {
  try {
    const firstLaunch = await isFirstLaunch();
    res.json({ data: { isFirstLaunch: firstLaunch } });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/recommended/:id — 添加单个推荐模型
router.post('/recommended/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const recommendedModel = getRecommendedModelById(id);
    if (!recommendedModel) {
      res.status(404).json({ error: `推荐模型 "${id}" 不存在` });
      return;
    }

    const currentConfig = await loadModelsConfig();
    const existingIds = new Set(currentConfig.models.map((m) => m.id));

    if (existingIds.has(id)) {
      res.status(409).json({ error: `模型 "${id}" 已存在` });
      return;
    }

    const newModel = { ...recommendedModel };
    const updatedModels = [...currentConfig.models, newModel];
    const newDefaultModelId = currentConfig.defaultModelId || newModel.id;

    const config = await saveModelsConfig(updatedModels, newDefaultModelId);
    const sanitized = {
      ...config,
      models: config.models.map((m) => {
        const { apiKey, apiKeys, ...rest } = m as any;
        return rest;
      }),
    };
    res.json({ data: sanitized });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// POST /api/models/add-recommended — 一键添加所有推荐模型
router.post('/add-recommended', async (_req: Request, res: Response) => {
  try {
    const currentConfig = await loadModelsConfig();
    const existingIds = new Set(currentConfig.models.map((m) => m.id));
    const recommended = getRecommendedModels();

    const modelsToAdd = recommended.filter((m) => !existingIds.has(m.id));
    if (modelsToAdd.length === 0) {
      const sanitized = {
        ...currentConfig,
        models: currentConfig.models.map((m) => {
          const { apiKey, apiKeys, ...rest } = m as any;
          return rest;
        }),
      };
      res.json({ data: sanitized, added: 0, message: '所有推荐模型已存在' });
      return;
    }

    const updatedModels = [...currentConfig.models, ...modelsToAdd];
    const newDefaultModelId = currentConfig.defaultModelId || modelsToAdd[0].id;

    const config = await saveModelsConfig(updatedModels, newDefaultModelId);
    const sanitized = {
      ...config,
      models: config.models.map((m) => {
        const { apiKey, apiKeys, ...rest } = m as any;
        return rest;
      }),
    };
    res.json({ data: sanitized, added: modelsToAdd.length, message: `成功添加 ${modelsToAdd.length} 个推荐模型` });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
