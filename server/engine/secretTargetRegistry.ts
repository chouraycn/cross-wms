/**
 * 密钥目标注册表
 *
 * 定义密钥配置目标的模式和验证规则
 */

import type { SecretTarget } from './secretsTypes.js';

const SECRET_INPUT_SHAPE = 'secret_input';
const SIBLING_REF_SHAPE = 'sibling_ref';

const CORE_SECRET_TARGET_REGISTRY: SecretTarget[] = [
  {
    id: 'models.providers.*.apiKey',
    targetType: 'models.providers.apiKey',
    configFile: 'openclaw.json',
    pathPattern: 'models.providers.*.apiKey',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
    providerIdPathSegmentIndex: 2,
    trackProviderShadowing: true,
  },
  {
    id: 'models.providers.*.headers.*',
    targetType: 'models.providers.headers',
    configFile: 'openclaw.json',
    pathPattern: 'models.providers.*.headers.*',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
    providerIdPathSegmentIndex: 2,
  },
  {
    id: 'tools.web.search.apiKey',
    targetType: 'tools.web.search.apiKey',
    configFile: 'openclaw.json',
    pathPattern: 'tools.web.search.apiKey',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'tools.web.fetch.firecrawl.apiKey',
    targetType: 'tools.web.fetch.firecrawl.apiKey',
    configFile: 'openclaw.json',
    pathPattern: 'tools.web.fetch.firecrawl.apiKey',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'agents.defaults.memorySearch.remote.apiKey',
    targetType: 'agents.defaults.memorySearch.remote.apiKey',
    configFile: 'openclaw.json',
    pathPattern: 'agents.defaults.memorySearch.remote.apiKey',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'gateway.auth.token',
    targetType: 'gateway.auth.token',
    configFile: 'openclaw.json',
    pathPattern: 'gateway.auth.token',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'gateway.auth.password',
    targetType: 'gateway.auth.password',
    configFile: 'openclaw.json',
    pathPattern: 'gateway.auth.password',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'cron.webhookToken',
    targetType: 'cron.webhookToken',
    configFile: 'openclaw.json',
    pathPattern: 'cron.webhookToken',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
  {
    id: 'skills.entries.*.apiKey',
    targetType: 'skills.entries.apiKey',
    configFile: 'openclaw.json',
    pathPattern: 'skills.entries.*.apiKey',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
  },
];

let cachedSecretTargetRegistry: SecretTarget[] | null = null;

/**
 * 获取核心密钥目标注册表
 */
export function getCoreSecretTargetRegistry(): SecretTarget[] {
  return CORE_SECRET_TARGET_REGISTRY;
}

/**
 * 获取完整的密钥目标注册表（包含缓存）
 */
export function getSecretTargetRegistry(): SecretTarget[] {
  if (cachedSecretTargetRegistry) {
    return cachedSecretTargetRegistry;
  }
  cachedSecretTargetRegistry = [...CORE_SECRET_TARGET_REGISTRY];
  return cachedSecretTargetRegistry;
}

/**
 * 获取可用于审计的目标条目
 */
export function listAuditableSecretTargets(): SecretTarget[] {
  return getSecretTargetRegistry().filter((entry) => entry.includeInAudit);
}

/**
 * 获取可用于计划的目标条目
 */
export function listPlanableSecretTargets(): SecretTarget[] {
  return getSecretTargetRegistry().filter((entry) => entry.includeInPlan);
}

/**
 * 按类型获取目标条目
 */
export function getSecretTargetsByType(targetType: string): SecretTarget[] {
  return getSecretTargetRegistry().filter(
    (entry) => entry.targetType === targetType || entry.id === targetType,
  );
}

/**
 * 根据 ID 获取目标条目
 */
export function getSecretTargetById(id: string): SecretTarget | undefined {
  return getSecretTargetRegistry().find((entry) => entry.id === id);
}

/**
 * 检查目标 ID 是否已知
 */
export function isKnownSecretTargetId(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return getSecretTargetRegistry().some((entry) => entry.id === value);
}

/**
 * 解析配置路径匹配的目标
 */
export function resolveConfigSecretTargetByPath(pathSegments: string[]): SecretTarget | null {
  for (const entry of getSecretTargetRegistry()) {
    if (!entry.includeInPlan) {
      continue;
    }
    if (matchesPathPattern(pathSegments, entry.pathPattern)) {
      return entry;
    }
  }
  return null;
}

/**
 * 检查路径是否匹配模式
 */
function matchesPathPattern(pathSegments: string[], pattern: string): boolean {
  const patternSegments = pattern.split('.');
  if (patternSegments.length !== pathSegments.length) {
    return false;
  }

  for (let i = 0; i < patternSegments.length; i++) {
    const patternSegment = patternSegments[i];
    const pathSegment = pathSegments[i];

    if (patternSegment === '*') {
      continue;
    }

    if (patternSegment !== pathSegment) {
      return false;
    }
  }

  return true;
}

/**
 * 获取提供者 ID 路径段索引
 */
export function getProviderIdFromPath(
  entry: SecretTarget,
  pathSegments: string[],
): string | undefined {
  if (entry.providerIdPathSegmentIndex === undefined) {
    return undefined;
  }
  return pathSegments[entry.providerIdPathSegmentIndex];
}

/**
 * 清除注册表缓存
 */
export function clearSecretTargetRegistryCache(): void {
  cachedSecretTargetRegistry = null;
}