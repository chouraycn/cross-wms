/**
 * SecretRef 字符串解析入口
 *
 * 兼容 OpenClaw 的 resolveSecretRefString API，桥接到 cross-wms 自带的
 * secrets 子系统（resolver.ts + provider.ts）。
 *
 * 使用场景：provider-auth-ref.ts 和 wizard/setup.secret-input.ts
 */

import { logger } from '../../logger.js';
import type { SecretRef } from './types.js';
import { resolveSecretRefAsync } from './resolver.js';
import { createDefaultProviderRegistry } from './provider.js';

export interface ResolveSecretRefOptions {
  config?: unknown;
  env?: Record<string, string | undefined>;
}

/**
 * 解析一个 SecretRef 并要求返回非空字符串结果。
 *
 * 若解析失败则抛出错误，与 OpenClaw API 行为一致。
 */
export async function resolveSecretRefString(
  ref: { source?: string; provider?: string; id?: string },
  options: ResolveSecretRefOptions = {},
): Promise<string> {
  const provider = ref.provider ?? ref.source ?? 'env';
  const key = ref.id ?? '';

  if (!key) {
    throw new Error(`resolveSecretRefString: secret key is empty (ref: ${provider}:${key})`);
  }

  const secretRef: SecretRef = {
    provider: provider as SecretRef['provider'],
    key,
  };

  const registry = createDefaultProviderRegistry(options.env ? (key: string) => options.env![key] ?? null : undefined);
  const resolved = await resolveSecretRefAsync(secretRef, registry, 'resolveSecretRefString');

  if (!resolved || !resolved.value) {
    throw new Error(
      `resolveSecretRefString: secret reference "${provider}:${key}" could not be resolved`,
    );
  }

  logger.debug(`[secrets:resolve] 解析成功: ${provider}:${key}`);
  return resolved.value;
}
