/**
 * Secrets Gateway Methods — 密钥管理 RPC 方法
 *
 * 架构定位：
 * - 参考 openclaw/src/gateway/server-methods/secrets.ts
 * - 精简版：实现 list / get / set 三个核心方法
 * - 接入 cross-wms 的 SecretsManager（server/engine/secrets/manager.ts）
 * - list 返回密钥元数据（不含明文）；get 按 id 返回元数据；set 创建或更新密钥
 */

import type { GatewayMethodContext } from './types.js';
import { getMethodRegistry } from './methodRegistry.js';
import { createSecretsManager } from '../engine/secrets/manager.js';
import type { SecretProvider } from '../engine/secrets/types.js';

// Registry 类型从 getMethodRegistry 推导，避免依赖未导出的 MethodRegistry 类
type GatewayMethodRegistry = ReturnType<typeof getMethodRegistry>;

// 共享密钥管理器实例
const secretsManager = createSecretsManager();

const VALID_PROVIDERS = new Set<SecretProvider>([
  'env',
  'file',
  'encrypted',
  'keychain',
  'aliyun-kms',
  'tencent-kms',
  'exec',
]);

function isSecretProvider(value: any): value is SecretProvider {
  return typeof value === 'string' && VALID_PROVIDERS.has(value as SecretProvider);
}

// ========== Secrets List ==========

async function secretsList(params: any, _ctx: GatewayMethodContext) {
  const { provider, scope, scopeId, tag } = params as {
    provider?: SecretProvider;
    scope?: string;
    scopeId?: string;
    tag?: string;
  };

  const filter: { provider?: SecretProvider; scope?: never; scopeId?: string; tag?: string } = {};
  if (provider) filter.provider = provider;
  if (scopeId) filter.scopeId = scopeId;
  if (tag) filter.tag = tag;

  let records = secretsManager.list(
    Object.keys(filter).length > 0 ? filter : undefined,
  );

  // scope 过滤（SecretsManager.list 接受 scope 但类型限制较严，这里二次过滤）
  if (scope) {
    records = records.filter((r) => r.scope === scope);
  }

  return {
    ok: true,
    secrets: records,
    total: records.length,
  };
}

// ========== Secrets Get ==========

async function secretsGet(params: any, _ctx: GatewayMethodContext) {
  const { id, provider, key, includeValue = false } = params as {
    id?: string;
    provider?: string;
    key?: string;
    includeValue?: boolean;
  };

  let record = null;

  if (id) {
    record = secretsManager.get(id);
  } else if (provider && key) {
    if (!isSecretProvider(provider)) {
      return {
        ok: false,
        error: { code: 'INVALID_REQUEST', message: `invalid provider: ${provider}` },
      };
    }
    record = secretsManager.getByKey(provider, key);
  } else {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: 'id or (provider and key) is required' },
    };
  }

  if (!record) {
    return { ok: false, error: { code: 'NOT_FOUND', message: 'secret not found' } };
  }

  // 默认不返回明文值；仅在 includeValue=true 时返回（注意安全）
  const result: Record<string, any> = { ...record };
  if (includeValue && record.id) {
    result.value = secretsManager.getValue(record.id, 'gateway.secrets.get');
  }

  return {
    ok: true,
    secret: result,
  };
}

// ========== Secrets Set ==========

async function secretsSet(params: any, _ctx: GatewayMethodContext) {
  const {
    provider,
    key,
    value,
    type = 'other',
    description,
    expiresAt,
    tags,
    scope,
    scopeId,
  } = params as {
    provider: string;
    key: string;
    value: string;
    type?: string;
    description?: string;
    expiresAt?: number;
    tags?: string[];
    scope?: string;
    scopeId?: string;
  };

  if (!isSecretProvider(provider)) {
    return {
      ok: false,
      error: { code: 'INVALID_REQUEST', message: `invalid provider: ${provider}` },
    };
  }
  if (!key) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'key is required' } };
  }
  if (!value) {
    return { ok: false, error: { code: 'INVALID_REQUEST', message: 'value is required' } };
  }

  // 已存在则更新，否则创建
  const existing = secretsManager.getByKey(provider, key);
  if (existing) {
    const updated = secretsManager.update(existing.id, {
      value,
      type: type as never,
      description,
      expiresAt,
      tags,
    });
    return {
      ok: true,
      action: 'updated' as const,
      secret: updated,
    };
  }

  const created = secretsManager.create({
    provider,
    key,
    value,
    type: type as never,
    description,
    expiresAt,
    tags,
    scope: scope as never,
    scopeId,
  });

  return {
    ok: true,
    action: 'created' as const,
    secret: created,
  };
}

/**
 * 注册所有密钥方法
 */
export function registerSecretsMethods(registry: GatewayMethodRegistry): void {
  registry.register('secrets.list', secretsList);
  registry.register('secrets.get', secretsGet);
  registry.register('secrets.set', secretsSet);
}
