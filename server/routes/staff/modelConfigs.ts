/**
 * StaffDeck Model Configs Routes — 挂载 /api/staffdeck/model-configs
 *
 * 端点：
 *   GET    /protocols                — 获取所有支持的协议
 *   GET    /                          — 列表
 *   POST   /                          — 创建（含 api_key 加密）
 *   PUT    /:config_id               — 更新
 *   POST   /:config_id/set-default   — 设置为默认
 *   POST   /:config_id/test          — 测试模型连接（stub）
 */
import { Router, type Request, type Response } from 'express';
import { DEFAULT_TENANT_ID } from '../../db-staff.js';
import type { ModelConfigRow, ModelConfigRead } from '../../types/staff.js';
import * as modelConfigDao from '../../dao/staff/staffModelConfigDao.js';
import { logger } from '../../logger.js';

const router = Router();

// ===================== api_key 加密 stub =====================

/**
 * Stub 加密：将明文 api_key 编码为 base64。
 * 生产环境应替换为 Fernet 或 AES 加密（参考 StaffDeck security/encryption.py）。
 * 解密时反向解码即可。
 */
function encryptApiKey(plain: string): string {
  return Buffer.from(plain, 'utf-8').toString('base64');
}

/** Stub 解密：base64 解码为明文 */
function decryptApiKey(encrypted: string): string {
  try {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}

/** 脱敏 api_key：保留首尾若干字符，中间用 **** 替换 */
function maskApiKey(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 3)}-****${value.slice(-4)}`;
}

// ===================== 支持的协议列表 =====================

const AVAILABLE_PROTOCOLS = [
  'openai_chat_completions',
  'anthropic_messages',
  'gemini_generate_content',
];

// ===================== Row → Read 转换 =====================

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function modelConfigRead(row: ModelConfigRow): ModelConfigRead {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    name: row.name,
    provider: row.provider,
    api_protocol: row.api_protocol,
    base_url: row.base_url,
    // 安全字段：不暴露 api_key_encrypted，仅返回脱敏后的 key
    api_key_masked: maskApiKey(decryptApiKey(row.api_key_encrypted)),
    model: row.model,
    temperature: row.temperature,
    max_output_tokens: row.max_output_tokens,
    extra_body: parseJson(row.extra_body_json, {}),
    protocol_options: parseJson(row.protocol_options_json, {}),
    legacy_unmapped_options: parseJson(row.legacy_unmapped_options_json, {}),
    trust_status: row.trust_status,
    verified_at: row.verified_at,
    verified_fingerprint: row.verified_fingerprint,
    verification_attempt_id: row.verification_attempt_id,
    verification_started_at: row.verification_started_at,
    verification_attempt_status: row.verification_attempt_status,
    verification_attempt_error_code: row.verification_attempt_error_code,
    config_revision: row.config_revision,
    security_revision: row.security_revision,
    key_revision: row.key_revision,
    is_default: row.is_default === 1,
    enabled: row.enabled === 1,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * 兼容别名：api_key_masked 已并入 modelConfigRead / ModelConfigRead 类型，
 * 保留此函数名以免大范围改动调用点。
 */
function modelConfigReadWithMask(row: ModelConfigRow): ModelConfigRead {
  return modelConfigRead(row);
}

// ===================== GET /protocols — 支持的协议 =====================

router.get('/protocols', (_req: Request, res: Response) => {
  res.json({ code: 0, data: { protocols: AVAILABLE_PROTOCOLS }, message: 'ok' });
});

// ===================== GET / — 列表 =====================

router.get('/', (req: Request, res: Response) => {
  const tenantId = (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const rows = modelConfigDao.listModelConfigs(tenantId);
  res.json({ code: 0, data: rows.map(modelConfigReadWithMask), message: 'ok' });
});

// ===================== POST / — 创建 =====================

router.post('/', (req: Request, res: Response) => {
  const {
    name,
    provider,
    api_protocol,
    base_url,
    api_key,
    model,
    temperature,
    max_output_tokens,
    extra_body,
    protocol_options,
    legacy_unmapped_options,
    trust_status,
    enabled,
    is_default,
  } = req.body;

  if (!name || typeof name !== 'string' || name.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'name 不能为空' });
    return;
  }
  if (!api_key || typeof api_key !== 'string' || api_key.trim() === '') {
    res.status(400).json({ code: 400, data: null, message: 'api_key 不能为空' });
    return;
  }
  if (!model || typeof model !== 'string') {
    res.status(400).json({ code: 400, data: null, message: 'model 不能为空' });
    return;
  }

  const tenantId = (req.body.tenant_id as string) || DEFAULT_TENANT_ID;

  try {
    const row = modelConfigDao.createModelConfig({
      tenant_id: tenantId,
      name: name.trim(),
      provider,
      api_protocol,
      base_url: base_url ?? null,
      api_key_encrypted: encryptApiKey(api_key),
      model,
      temperature,
      max_output_tokens,
      extra_body,
      protocol_options,
      legacy_unmapped_options,
      trust_status,
      enabled: is_default ? true : enabled,
      is_default: false, // 创建时不直接设为默认，需通过 set-default 端点
    });
    res.status(201).json({ code: 0, data: modelConfigReadWithMask(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '模型配置名称已存在或默认配置冲突' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== PUT /:config_id — 更新 =====================

router.put('/:config_id', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const configId = req.params.config_id;

  const existing = modelConfigDao.getModelConfigById(tenantId, configId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
    return;
  }

  const updates: Parameters<typeof modelConfigDao.updateModelConfig>[2] = {};
  if (req.body.name !== undefined) updates.name = req.body.name;
  if (req.body.provider !== undefined) updates.provider = req.body.provider;
  if (req.body.api_protocol !== undefined) updates.api_protocol = req.body.api_protocol;
  if (req.body.base_url !== undefined) updates.base_url = req.body.base_url;
  if (req.body.api_key !== undefined && req.body.api_key !== '') {
    updates.api_key_encrypted = encryptApiKey(req.body.api_key);
    updates.key_revision = existing.key_revision + 1;
  }
  if (req.body.model !== undefined) updates.model = req.body.model;
  if (req.body.temperature !== undefined) updates.temperature = req.body.temperature;
  if (req.body.max_output_tokens !== undefined) updates.max_output_tokens = req.body.max_output_tokens;
  if (req.body.extra_body !== undefined) updates.extra_body = req.body.extra_body;
  if (req.body.protocol_options !== undefined) updates.protocol_options = req.body.protocol_options;
  if (req.body.legacy_unmapped_options !== undefined) updates.legacy_unmapped_options = req.body.legacy_unmapped_options;
  if (req.body.enabled !== undefined) updates.enabled = req.body.enabled;

  // 安全敏感字段变更时重置验证状态
  const securityChanged =
    updates.api_protocol !== undefined ||
    updates.base_url !== undefined ||
    updates.model !== undefined ||
    updates.api_key_encrypted !== undefined ||
    updates.protocol_options !== undefined;
  if (securityChanged) {
    updates.trust_status = 'unverified';
    updates.verified_at = null;
    updates.verified_fingerprint = null;
    updates.security_revision = existing.security_revision + 1;
    updates.enabled = false;
  }
  if (req.body.name !== undefined || updates.model !== undefined || updates.temperature !== undefined || updates.max_output_tokens !== undefined) {
    updates.config_revision = existing.config_revision + 1;
  }

  try {
    const row = modelConfigDao.updateModelConfig(tenantId, configId, updates);
    if (!row) {
      res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
      return;
    }
    res.json({ code: 0, data: modelConfigReadWithMask(row), message: 'ok' });
  } catch (e) {
    const message = (e as Error).message;
    if (message.includes('UNIQUE constraint')) {
      res.status(409).json({ code: 409, data: null, message: '默认配置冲突' });
      return;
    }
    res.status(400).json({ code: 400, data: null, message });
  }
});

// ===================== POST /:config_id/set-default — 设置为默认 =====================

router.post('/:config_id/set-default', (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const configId = req.params.config_id;

  const existing = modelConfigDao.getModelConfigById(tenantId, configId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
    return;
  }
  if (existing.trust_status !== 'verified' && existing.trust_status !== 'legacy_trusted') {
    res.status(409).json({ code: 409, data: null, message: 'MODEL_CONFIG_VERIFICATION_REQUIRED' });
    return;
  }
  if (!existing.enabled) {
    res.status(409).json({ code: 409, data: null, message: 'MODEL_CONFIG_DISABLED' });
    return;
  }

  try {
    const row = modelConfigDao.setDefaultModelConfig(tenantId, configId);
    if (!row) {
      res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
      return;
    }
    res.json({ code: 0, data: modelConfigReadWithMask(row), message: 'ok' });
  } catch (e) {
    res.status(409).json({ code: 409, data: null, message: 'MODEL_DEFAULT_CONFLICT' });
  }
});

// ===================== 真实模型连通性探测 =====================

/** 拼接 base URL 与路径，自动规整多余斜杠 */
function joinUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${trimmed}${p}`;
}

interface ProbeResult {
  ok: boolean;
  status?: number;
  latencyMs: number;
  output: string | null;
  error?: string;
  errorCode?: string;
}

/**
 * 按配置自身的 provider / baseUrl / apiKey / model 发起一次最小探测请求。
 * 支持三种协议：openai_chat_completions（OpenAI 兼容）、anthropic_messages、gemini_generate_content。
 * 不依赖环境变量中的全局 API Key，严格使用配置内落库的凭据，因此能真实反映该配置是否可达。
 */
async function probeModelConnectivity(row: ModelConfigRow, apiKey: string): Promise<ProbeResult> {
  const PROBE_TIMEOUT_MS = 30_000;
  const start = Date.now();
  const protocol = row.api_protocol || 'openai_chat_completions';
  const model = row.model;

  let url: string;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  let body: Record<string, any>;

  if (protocol === 'anthropic_messages') {
    const base = row.base_url || 'https://api.anthropic.com';
    url = joinUrl(base, '/v1/messages');
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
  } else if (protocol === 'gemini_generate_content') {
    const base = row.base_url || 'https://generativelanguage.googleapis.com/v1beta';
    url = `${joinUrl(base, `/models/${encodeURIComponent(model)}:generateContent`)}?key=${encodeURIComponent(apiKey)}`;
    body = {
      contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
      generationConfig: { maxOutputTokens: 1 },
    };
  } else {
    // openai_chat_completions（默认，OpenAI 兼容协议）
    const base = row.base_url || 'https://api.openai.com/v1';
    url = joinUrl(base, '/chat/completions');
    headers['authorization'] = `Bearer ${apiKey}`;
    body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: false };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - start;
    const text = await resp.text();
    if (!resp.ok) {
      let detail = text.slice(0, 500);
      try {
        const j = JSON.parse(text);
        if (j?.error?.message) detail = String(j.error.message);
      } catch {
        /* 保留原始文本 */
      }
      return {
        ok: false,
        status: resp.status,
        latencyMs,
        output: null,
        error: `HTTP ${resp.status}: ${detail}`,
        errorCode: 'PROVIDER_ERROR',
      };
    }
    let output: string | null = null;
    try {
      const j = JSON.parse(text);
      if (protocol === 'anthropic_messages') {
        output = j?.content?.[0]?.text ?? null;
      } else if (protocol === 'gemini_generate_content') {
        output = j?.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
      } else {
        output = j?.choices?.[0]?.message?.content ?? j?.choices?.[0]?.text ?? null;
      }
    } catch {
      output = text.slice(0, 200);
    }
    return {
      ok: true,
      status: resp.status,
      latencyMs,
      output: output !== null ? String(output).slice(0, 200) : null,
    };
  } catch (e) {
    const latencyMs = Date.now() - start;
    const msg = e instanceof Error ? e.message : String(e);
    const aborted = msg.includes('aborted') || msg.includes('The operation was aborted');
    return {
      ok: false,
      latencyMs,
      output: null,
      error: aborted ? `探测超时（>${PROBE_TIMEOUT_MS}ms）` : msg,
      errorCode: aborted ? 'TIMEOUT' : 'NETWORK_ERROR',
    };
  } finally {
    clearTimeout(timer);
  }
}

// ===================== POST /:config_id/test — 测试模型连接（真实连通性探测） =====================

router.post('/:config_id/test', async (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const configId = req.params.config_id;
  const activateIfInitial =
    String(req.query.activate_if_initial) === 'true' || req.body?.activate_if_initial === true;

  const existing = modelConfigDao.getModelConfigById(tenantId, configId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
    return;
  }

  const apiKey = decryptApiKey(existing.api_key_encrypted);
  if (!apiKey) {
    res.json({
      code: 0,
      data: {
        success: false,
        message: '该配置未配置有效的 API Key，无法探测',
        output: null,
        activated: false,
        trust_status: existing.trust_status,
        attempt_status: 'failed',
        capabilities: [],
        latency_ms: 0,
      },
      message: 'ok',
    });
    return;
  }
  if (!existing.model) {
    res.json({
      code: 0,
      data: {
        success: false,
        message: '该配置未指定 model，无法探测',
        output: null,
        activated: false,
        trust_status: existing.trust_status,
        attempt_status: 'failed',
        capabilities: [],
        latency_ms: 0,
      },
      message: 'ok',
    });
    return;
  }

  const startedAt = Math.floor(Date.now() / 1000);
  const probe = await probeModelConnectivity(existing, apiKey);
  logger.info('[StaffModelConfig] 模型连通性探测', {
    configId,
    provider: existing.provider,
    protocol: existing.api_protocol,
    ok: probe.ok,
    status: probe.status,
    latencyMs: probe.latencyMs,
  });

  if (probe.ok) {
    // 真实验证通过：先落库验证状态 + 启用该配置（set-default 守卫要求 verified+enabled）
    const updatedRow = modelConfigDao.updateModelConfig(tenantId, configId, {
      trust_status: 'verified',
      verified_at: Math.floor(Date.now() / 1000),
      verification_started_at: startedAt,
      verification_attempt_status: 'succeeded',
      verification_attempt_error_code: null,
      verified_fingerprint: `${existing.provider}:${existing.model}`,
      enabled: true,
      config_revision: existing.config_revision + 1,
    });
    // 若要求初始化即激活，且当前租户无默认配置，则将该配置设为默认
    let becameDefault = false;
    if (activateIfInitial) {
      const hasDefault = modelConfigDao
        .listModelConfigs(tenantId)
        .some((c) => c.id !== configId && c.is_default === 1);
      if (!hasDefault) {
        const def = modelConfigDao.setDefaultModelConfig(tenantId, configId);
        becameDefault = !!def;
      }
    }
    const read = modelConfigReadWithMask(
      modelConfigDao.getModelConfigById(tenantId, configId) ?? updatedRow ?? existing,
    );
    res.json({
      code: 0,
      data: {
        success: true,
        message: becameDefault ? '连接成功，已启用并设为默认模型' : '连接成功',
        output: probe.output,
        activated: becameDefault,
        trust_status: 'verified',
        attempt_status: 'succeeded',
        capabilities: [],
        latency_ms: probe.latencyMs,
        model: read,
      },
      message: 'ok',
    });
    return;
  }

  // 探测失败：记录失败状态，保留既有启用状态（不自动禁用，避免误伤）
  modelConfigDao.updateModelConfig(tenantId, configId, {
    verified_at: null,
    verification_started_at: startedAt,
    verification_attempt_status: 'failed',
    verification_attempt_error_code: probe.errorCode ?? 'PROVIDER_ERROR',
    config_revision: existing.config_revision + 1,
  });
  res.json({
    code: 0,
    data: {
      success: false,
      message: `连接失败：${probe.error ?? '未知错误'}`,
      output: null,
      activated: false,
      trust_status: existing.trust_status,
      attempt_status: 'failed',
      capabilities: [],
      latency_ms: probe.latencyMs,
      error_code: probe.errorCode,
    },
    message: 'ok',
  });
});

export default router;
