/**
 * 密钥目标注册表
 *
 * 定义密钥配置目标的位置模式和验证规则。
 * 用于声明式密钥管理：plan / apply / audit 时根据目标注册表定位需要处理的配置项。
 */

import type { SecretTarget } from './types.js';

const SECRET_INPUT_SHAPE = 'secret_input';
const SIBLING_REF_SHAPE = 'sibling_ref';

/** 核心目标注册表 */
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
  {
    id: 'channels.*.token',
    targetType: 'channels.token',
    configFile: 'openclaw.json',
    pathPattern: 'channels.*.token',
    secretShape: SECRET_INPUT_SHAPE,
    expectedResolvedValue: 'string',
    includeInPlan: true,
    includeInConfigure: true,
    includeInAudit: true,
    providerIdPathSegmentIndex: 1,
  },
];

let cachedRegistry: SecretTarget[] | null = null;

/** 获取核心注册表 */
export function getCoreSecretTargetRegistry(): SecretTarget[] {
  return CORE_SECRET_TARGET_REGISTRY;
}

/** 获取完整注册表（含缓存） */
export function getSecretTargetRegistry(): SecretTarget[] {
  if (cachedRegistry) return cachedRegistry;
  cachedRegistry = [...CORE_SECRET_TARGET_REGISTRY];
  return cachedRegistry;
}

/** 可审计目标 */
export function listAuditableSecretTargets(): SecretTarget[] {
  return getSecretTargetRegistry().filter(e => e.includeInAudit);
}

/** 可计划目标 */
export function listPlanableSecretTargets(): SecretTarget[] {
  return getSecretTargetRegistry().filter(e => e.includeInPlan);
}

/** 按类型查询 */
export function getSecretTargetsByType(targetType: string): SecretTarget[] {
  return getSecretTargetRegistry().filter(e => e.targetType === targetType || e.id === targetType);
}

/** 按 ID 查询 */
export function getSecretTargetById(id: string): SecretTarget | undefined {
  return getSecretTargetRegistry().find(e => e.id === id);
}

/** 检查目标 ID 是否已知 */
export function isKnownSecretTargetId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return getSecretTargetRegistry().some(e => e.id === value);
}

/** 根据路径段解析目标 */
export function resolveConfigSecretTargetByPath(pathSegments: string[]): SecretTarget | null {
  for (const entry of getSecretTargetRegistry()) {
    if (!entry.includeInPlan) continue;
    if (matchesPathPattern(pathSegments, entry.pathPattern)) return entry;
  }
  return null;
}

/** 路径模式匹配 */
function matchesPathPattern(pathSegments: string[], pattern: string): boolean {
  const patternSegments = pattern.split('.');
  if (patternSegments.length !== pathSegments.length) return false;
  for (let i = 0; i < patternSegments.length; i++) {
    if (patternSegments[i] === '*') continue;
    if (patternSegments[i] !== pathSegments[i]) return false;
  }
  return true;
}

/** 获取提供者 ID */
export function getProviderIdFromPath(entry: SecretTarget, pathSegments: string[]): string | undefined {
  if (entry.providerIdPathSegmentIndex === undefined) return undefined;
  return pathSegments[entry.providerIdPathSegmentIndex];
}

/** 清除缓存 */
export function clearSecretTargetRegistryCache(): void {
  cachedRegistry = null;
}
