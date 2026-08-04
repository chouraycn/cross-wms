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
import { complete } from '../../engine/llm/index.js';

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

// ===================== POST /:config_id/test — 测试模型连接（stub） =====================

router.post('/:config_id/test', async (req: Request, res: Response) => {
  const tenantId = (req.body.tenant_id as string) || (req.query.tenant_id as string) || DEFAULT_TENANT_ID;
  const configId = req.params.config_id;

  const existing = modelConfigDao.getModelConfigById(tenantId, configId);
  if (!existing) {
    res.status(404).json({ code: 404, data: null, message: '模型配置不存在' });
    return;
  }

  // 真实连通性探测：用该配置引用的模型做一次最短文本补全（依赖环境变量中的 API Key）
  try {
    if (!existing.model) {
      throw new Error('该配置未指定 model，无法探测');
    }
    const output = await complete({
      model: existing.model,
      messages: [{ role: 'user', content: 'ping' }],
    });
    res.json({
      code: 0,
      data: {
        success: true,
        message: '连接成功',
        output: output.slice(0, 200),
        activated: true,
        trust_status: existing.trust_status,
        attempt_status: 'succeeded',
        capabilities: [],
      },
      message: 'ok',
    });
  } catch (e) {
    const msg = (e as Error).message;
    res.json({
      code: 0,
      data: {
        success: false,
        message: `连接失败：${msg}`,
        output: null,
        activated: false,
        trust_status: existing.trust_status,
        attempt_status: 'failed',
        capabilities: [],
      },
      message: 'ok',
    });
  }
});

export default router;
