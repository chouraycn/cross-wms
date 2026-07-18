/**
 * 密钥解析器
 *
 * 提供：
 * - 引用解析：根据 SecretRef 从 Provider 获取值
 * - 模板展开：将 ${secret:provider:key} 模板替换为实际值
 * - 回退链：支持多个候选 ref，按优先级返回首个可用值
 */

import { logger } from '../../logger.js';
import type { SecretRef, ResolvedSecret, SecretProvider } from './types.js';
import type { ProviderRegistry, ISecretProvider } from './provider.js';

/** 模板标记前缀 */
const TEMPLATE_PREFIX = '${secret:';
const TEMPLATE_SUFFIX = '}';

/**
 * 解析单个密钥引用
 *
 * @param ref - 密钥引用
 * @param registry - Provider 注册表
 * @param source - 访问来源
 */
export function resolveSecretRef(
  ref: SecretRef,
  registry: ProviderRegistry,
  source: string = 'unknown',
): ResolvedSecret | null {
  const provider = registry.get(ref.provider);
  if (!provider) {
    logger.warn('[SecretResolver] 未找到 Provider', { provider: ref.provider });
    return null;
  }

  const value = provider.resolve(ref);
  if (value === null) {
    logger.debug('[SecretResolver] 解析返回 null', { provider: ref.provider, key: ref.key });
    return null;
  }

  return {
    ref,
    value,
    source: ref.provider,
    resolvedAt: Date.now(),
    cached: false,
  };
}

/**
 * 异步解析单个密钥引用
 */
export async function resolveSecretRefAsync(
  ref: SecretRef,
  registry: ProviderRegistry,
  source: string = 'unknown',
): Promise<ResolvedSecret | null> {
  const provider = registry.get(ref.provider);
  if (!provider) {
    logger.warn('[SecretResolver] 未找到 Provider', { provider: ref.provider });
    return null;
  }

  const value = await provider.resolveAsync(ref);
  if (value === null) return null;

  return {
    ref,
    value,
    source: ref.provider,
    resolvedAt: Date.now(),
    cached: false,
  };
}

/**
 * 批量解析密钥引用
 */
export function resolveSecretRefs(
  refs: SecretRef[],
  registry: ProviderRegistry,
  source: string = 'batch-resolve',
): Map<string, ResolvedSecret | null> {
  const results = new Map<string, ResolvedSecret | null>();
  for (const ref of refs) {
    const cacheKey = `${ref.provider}:${ref.key}`;
    results.set(cacheKey, resolveSecretRef(ref, registry, source));
  }
  return results;
}

/**
 * 异步批量解析密钥引用
 */
export async function resolveSecretRefsAsync(
  refs: SecretRef[],
  registry: ProviderRegistry,
  source: string = 'batch-resolve-async',
): Promise<Map<string, ResolvedSecret | null>> {
  const results = new Map<string, ResolvedSecret | null>();
  const entries = await Promise.all(
    refs.map(async ref => {
      const cacheKey = `${ref.provider}:${ref.key}`;
      const resolved = await resolveSecretRefAsync(ref, registry, source);
      return [cacheKey, resolved] as const;
    }),
  );
  for (const [key, value] of entries) {
    results.set(key, value);
  }
  return results;
}

/**
 * 解析回退链 — 按优先级返回首个可用值
 *
 * @param refs - 按优先级排序的引用列表
 * @param registry - Provider 注册表
 */
export function resolveWithFallback(
  refs: SecretRef[],
  registry: ProviderRegistry,
  source: string = 'fallback',
): ResolvedSecret | null {
  for (const ref of refs) {
    const resolved = resolveSecretRef(ref, registry, source);
    if (resolved) {
      if (refs.length > 1) {
        logger.debug('[SecretResolver] 回退链命中', {
          provider: ref.provider,
          key: ref.key,
          triedCount: refs.indexOf(ref) + 1,
        });
      }
      return resolved;
    }
  }
  logger.warn('[SecretResolver] 回退链全部失败', { refCount: refs.length });
  return null;
}

/**
 * 解析模板字符串 — 将 ${secret:provider:key} 替换为实际值
 *
 * 示例：
 *   "Authorization: Bearer ${secret:encrypted:openai-key}"
 *   → "Authorization: Bearer sk-xxxxx"
 *
 * 未找到的占位符保持原样。
 */
export function resolveTemplate(
  template: string,
  registry: ProviderRegistry,
  source: string = 'template',
): string {
  if (!template || !template.includes(TEMPLATE_PREFIX)) return template;

  let result = template;
  const pattern = /\$\{secret:([a-z\-]+):([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(result)) !== null) {
    const [full, providerStr, key] = match;
    const provider = providerStr as SecretProvider;
    if (!registry.has(provider)) continue;

    const ref: SecretRef = { provider, key };
    const resolved = resolveSecretRef(ref, registry, source);
    if (resolved) {
      result = result.replace(full, resolved.value);
      pattern.lastIndex = 0; // 重置索引以重新匹配替换后的字符串
    }
  }

  return result;
}

/**
 * 从模板中提取所有密钥引用
 */
export function extractSecretRefs(template: string): SecretRef[] {
  const refs: SecretRef[] = [];
  if (!template || !template.includes(TEMPLATE_PREFIX)) return refs;

  const pattern = /\$\{secret:([a-z\-]+):([^}]+)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(template)) !== null) {
    refs.push({ provider: match[1] as SecretProvider, key: match[2] });
  }
  return refs;
}

/**
 * 检查字符串是否为模板（含密钥占位符）
 */
export function isTemplate(value: string): boolean {
  return !!value && value.includes(TEMPLATE_PREFIX) && value.includes(TEMPLATE_SUFFIX);
}

/**
 * 验证密钥引用（通过 Provider 检查是否存在）
 */
export function validateSecretRef(
  ref: SecretRef,
  registry: ProviderRegistry,
): boolean {
  const provider = registry.get(ref.provider);
  if (!provider) return false;
  return provider.validate(ref);
}

/**
 * 获取 Provider（便捷方法）
 */
export function getProvider(registry: ProviderRegistry, type: SecretProvider): ISecretProvider | undefined {
  return registry.get(type);
}
