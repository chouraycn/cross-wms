/**
 * API Key Management REST API — API Key 管理端点
 *
 * 支持创建、列出、启用/禁用、删除 API Key，以及查看速率限制状态。
 */

import { Router } from 'express';
import { configureGatewayAuth, addApiKey, removeApiKey } from '../gateway/gatewayAuth.js';
import crypto from 'node:crypto';
import { ok, created, fail, notFound, serverError, BizCode } from './_shared/respond.js';

const router = Router();

// 内存存储 API Key 元数据（实际生产环境应使用数据库）
interface ApiKeyRecord {
  id: string;
  name: string;
  key: string;
  prefix: string;
  enabled: boolean;
  createdAt: number;
  lastUsedAt?: number;
  rateLimitPerMinute: number;
  metadata?: Record<string, any>;
}

const apiKeys = new Map<string, ApiKeyRecord>();

// 生成安全的 API Key
function generateApiKey(): string {
  const random = crypto.randomBytes(32).toString('base64url');
  return `cwms-${random}`;
}

function getPrefix(key: string): string {
  return key.slice(0, 12);
}

// GET /api/apikeys — 列出 API Key（隐藏完整 key）
router.get('/', (_req, res) => {
  try {
    const keys = Array.from(apiKeys.values()).map((record) => ({
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      enabled: record.enabled,
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt,
      rateLimitPerMinute: record.rateLimitPerMinute,
      metadata: record.metadata,
    }));

    return ok(res, keys);
  } catch (e) {
    return serverError(res, `获取 API Key 列表失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/apikeys — 创建 API Key
router.post('/', (req, res) => {
  try {
    const { name, rateLimitPerMinute = 60, metadata } = req.body || {};

    if (!name || typeof name !== 'string') {
      return fail(res, BizCode.BAD_REQUEST, '缺少 name 参数', 400);
    }

    const key = generateApiKey();
    const id = `key-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const record: ApiKeyRecord = {
      id,
      name,
      key,
      prefix: getPrefix(key),
      enabled: true,
      createdAt: Date.now(),
      rateLimitPerMinute,
      metadata,
    };

    apiKeys.set(id, record);
    addApiKey(key);

    // 仅创建时返回完整 key
    return created(res, {
      data: {
        id: record.id,
        name: record.name,
        key: record.key,
        prefix: record.prefix,
        enabled: record.enabled,
        createdAt: record.createdAt,
        rateLimitPerMinute: record.rateLimitPerMinute,
      },
      warning: '请妥善保存此 API Key，之后无法再次查看完整内容。',
    });
  } catch (e) {
    return serverError(res, `创建 API Key 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/apikeys/:id/enable — 启用 API Key
router.post('/:id/enable', (req, res) => {
  try {
    const record = apiKeys.get(req.params.id);
    if (!record) {
      return notFound(res, 'API Key 不存在');
    }

    record.enabled = true;
    addApiKey(record.key);

    return ok(res, { id: record.id, enabled: record.enabled });
  } catch (e) {
    return serverError(res, `启用 API Key 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/apikeys/:id/disable — 禁用 API Key
router.post('/:id/disable', (req, res) => {
  try {
    const record = apiKeys.get(req.params.id);
    if (!record) {
      return notFound(res, 'API Key 不存在');
    }

    record.enabled = false;
    removeApiKey(record.key);

    return ok(res, { id: record.id, enabled: record.enabled });
  } catch (e) {
    return serverError(res, `禁用 API Key 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// DELETE /api/apikeys/:id — 删除 API Key
router.delete('/:id', (req, res) => {
  try {
    const record = apiKeys.get(req.params.id);
    if (!record) {
      return notFound(res, 'API Key 不存在');
    }

    removeApiKey(record.key);
    apiKeys.delete(req.params.id);

    return ok(res, { success: true, message: 'API Key 已删除' });
  } catch (e) {
    return serverError(res, `删除 API Key 失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// GET /api/apikeys/stats — 统计信息
router.get('/stats', (_req, res) => {
  try {
    const total = apiKeys.size;
    const enabled = Array.from(apiKeys.values()).filter((k) => k.enabled).length;

    return ok(res, {
      total,
      enabled,
      disabled: total - enabled,
    });
  } catch (e) {
    return serverError(res, `获取 API Key 统计失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

// POST /api/apikeys/config — 更新全局认证配置
router.post('/config', (req, res) => {
  try {
    const { rateLimitPerMinute, trustedProxies } = req.body || {};

    const config: { rateLimitPerMinute?: number; trustedProxies?: string[] } = {};
    if (rateLimitPerMinute !== undefined) config.rateLimitPerMinute = rateLimitPerMinute;
    if (trustedProxies !== undefined) config.trustedProxies = trustedProxies;

    configureGatewayAuth(config);

    return ok(res, { success: true, config });
  } catch (e) {
    return serverError(res, `更新认证配置失败: ${e instanceof Error ? e.message : String(e)}`);
  }
});

export default router;
